/**
 * Pump.fun integration, built on the official @pump-fun/pump-sdk (v4.3.1, verified 2026-11-20).
 *
 * - Launch: `create_v2` (Token-2022 mint, SOL quote) via createV2Instruction, or
 *   createV2AndBuyInstructions (create_v2 + buy) when the creator chooses an initial buy.
 * - Bonding-curve trades: buy_v2 / sell_v2 (buyV2Instructions / sellV2Instructions).
 * - Migrated coins: PumpSwap AMM canonical pool via @pump-fun/pump-sdk/swap.
 *
 * Every transaction is built with the user's wallet as fee payer and is returned UNSIGNED.
 * This module has no `server-only` import so scripts and tests can use it with any Connection.
 */
import BN from "bn.js";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, unpackAccount } from "@solana/spl-token";
import {
  OnlinePumpSdk,
  PUMP_SDK,
  bondingCurvePda,
  canonicalPumpPoolPda,
  bondingCurveMarketCap,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
  type BondingCurve,
} from "@pump-fun/pump-sdk";
import { OnlinePumpAmmSdk, PUMP_AMM_SDK, buyQuoteInput, sellBaseInput } from "@pump-fun/pump-sdk/swap";

export const LAMPORTS_PER_SOL = 1_000_000_000;
/** Pump.fun coins use 6 decimals. */
export const TOKEN_DECIMALS = 6;

export interface PreparedTx {
  tx: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface FeeEstimate {
  networkFeeLamports: number;
  priorityFeeLamports: number;
  computeUnitLimit: number;
}

function computeBudget(units: number, microLamports: number): TransactionInstruction[] {
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units })];
  if (microLamports > 0) ixs.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
  return ixs;
}

export function estimateFees(signatures: number, units: number, microLamports: number): FeeEstimate {
  return {
    networkFeeLamports: 5000 * signatures,
    priorityFeeLamports: Math.ceil((units * microLamports) / 1_000_000),
    computeUnitLimit: units,
  };
}

async function compile(conn: Connection, payer: PublicKey, ixs: TransactionInstruction[]): Promise<PreparedTx> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return { tx: new VersionedTransaction(message), blockhash, lastValidBlockHeight };
}

// ------------------------------------------------------------------ launch

export interface LaunchParams {
  mint: PublicKey;
  user: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  devBuyLamports: bigint;
  priorityMicroLamports: number;
  /** Network-fee payer. Defaults to the user. The company wallet only when sponsorship is enabled. */
  feePayer?: PublicKey;
}

export async function buildLaunchTransaction(conn: Connection, p: LaunchParams) {
  const sdk = new OnlinePumpSdk(conn);
  const units = p.devBuyLamports > 0n ? 400_000 : 250_000;
  let ixs: TransactionInstruction[];
  let expectedTokens: BN | null = null;
  if (p.devBuyLamports > 0n) {
    const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
    const quoteAmount = new BN(p.devBuyLamports.toString());
    expectedTokens = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: quoteAmount,
      quoteMint: NATIVE_MINT,
    });
    // create_v2 + legacy `buy` (16 accounts). The buy_v2 variant (27 accounts) does not fit in a
    // single 1232-byte transaction without an address lookup table. The curve is created in the
    // same transaction, so the initial buy price is deterministic.
    ixs = await PUMP_SDK.createV2AndBuyInstructions({
      global,
      mint: p.mint,
      name: p.name,
      symbol: p.symbol,
      uri: p.uri,
      creator: p.user,
      user: p.user,
      amount: expectedTokens,
      solAmount: quoteAmount,
      mayhemMode: false,
    });
  } else {
    ixs = [
      await PUMP_SDK.createV2Instruction({
        mint: p.mint,
        name: p.name,
        symbol: p.symbol,
        uri: p.uri,
        creator: p.user,
        user: p.user,
        mayhemMode: false,
      }),
    ];
  }
  const prepared = await compile(conn, p.feePayer ?? p.user, [...computeBudget(units, p.priorityMicroLamports), ...ixs]);
  return {
    ...prepared,
    expectedTokens: expectedTokens?.toString() ?? null,
    fees: estimateFees(2, units, p.priorityMicroLamports),
  };
}

// ------------------------------------------------------------------ market state

export type Lifecycle = "bonding_curve" | "migrated" | "unknown";

export interface OnchainMarket {
  mint: string;
  lifecycle: Lifecycle;
  tokenProgram: string | null;
  priceSol: number | null;
  marketCapSol: number | null;
  curveProgress: number | null; // 0..1 of real token reserves sold
  complete: boolean;
  creator: string | null;
  pool: string | null;
  liquiditySol: number | null;
}

/** Fraction of the curve's initial real token reserves that has been bought (0..1). */
export function curveProgress(bc: Pick<BondingCurve, "realTokenReserves" | "complete">, initialRealTokenReserves: BN): number {
  if (bc.complete) return 1;
  if (initialRealTokenReserves.isZero()) return 0;
  const sold = initialRealTokenReserves.sub(bc.realTokenReserves);
  const pct = Number(sold.muln(10_000).div(initialRealTokenReserves).toString()) / 10_000;
  return Math.max(0, Math.min(1, pct));
}

export function priceSolPerToken(bc: Pick<BondingCurve, "virtualQuoteReserves" | "virtualTokenReserves">): number | null {
  if (bc.virtualTokenReserves.isZero()) return null;
  // lamports per base unit -> SOL per whole token
  const lamportsPerUnit = Number(bc.virtualQuoteReserves.toString()) / Number(bc.virtualTokenReserves.toString());
  return (lamportsPerUnit * 10 ** TOKEN_DECIMALS) / LAMPORTS_PER_SOL;
}

export async function tokenProgramOf(conn: Connection, mint: PublicKey): Promise<PublicKey | null> {
  const info = await conn.getAccountInfo(mint);
  if (!info) return null;
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  return null;
}

export async function fetchOnchainMarket(conn: Connection, mint: PublicKey): Promise<OnchainMarket> {
  const sdk = new OnlinePumpSdk(conn);
  const [mintInfo, curveInfo] = await conn.getMultipleAccountsInfo([mint, bondingCurvePda(mint)]);
  const tokenProgram =
    mintInfo && (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) || mintInfo.owner.equals(TOKEN_PROGRAM_ID))
      ? mintInfo.owner.toBase58()
      : null;
  const base: OnchainMarket = {
    mint: mint.toBase58(),
    lifecycle: "unknown",
    tokenProgram,
    priceSol: null,
    marketCapSol: null,
    curveProgress: null,
    complete: false,
    creator: null,
    pool: null,
    liquiditySol: null,
  };
  if (!curveInfo) return base;
  const bc = PUMP_SDK.decodeBondingCurve(curveInfo);
  base.creator = bc.creator.toBase58();
  base.complete = bc.complete;
  if (!bc.complete && !bc.virtualTokenReserves.isZero()) {
    const global = await sdk.fetchGlobal();
    base.lifecycle = "bonding_curve";
    base.priceSol = priceSolPerToken(bc);
    base.marketCapSol =
      Number(
        bondingCurveMarketCap({
          mintSupply: bc.tokenTotalSupply,
          virtualQuoteReserves: bc.virtualQuoteReserves,
          virtualTokenReserves: bc.virtualTokenReserves,
        }).toString(),
      ) / LAMPORTS_PER_SOL;
    base.curveProgress = curveProgress(bc, global.initialRealTokenReserves);
    base.liquiditySol = Number(bc.realQuoteReserves.toString()) / LAMPORTS_PER_SOL;
    return base;
  }
  // Completed curve: look for the canonical PumpSwap pool.
  const pool = canonicalPumpPoolPda(mint);
  const amm = new OnlinePumpAmmSdk(conn);
  try {
    const state = await amm.swapSolanaState(pool, PublicKey.default);
    base.lifecycle = "migrated";
    base.pool = pool.toBase58();
    const baseRes = Number(state.poolBaseAmount.toString());
    const quoteRes = Number(state.poolQuoteAmount.toString());
    if (baseRes > 0) {
      base.priceSol = ((quoteRes / baseRes) * 10 ** TOKEN_DECIMALS) / LAMPORTS_PER_SOL;
      const supply = Number(bc.tokenTotalSupply.toString()) / 10 ** TOKEN_DECIMALS;
      base.marketCapSol = base.priceSol * supply;
    }
    base.liquiditySol = (quoteRes / LAMPORTS_PER_SOL) * 2;
    base.curveProgress = 1;
  } catch {
    // Curve complete but pool not created yet (migration pending).
    base.lifecycle = "unknown";
    base.curveProgress = 1;
  }
  return base;
}

// ------------------------------------------------------------------ trading

export interface TradeQuote {
  venue: "bonding_curve" | "pump_amm";
  side: "buy" | "sell";
  inputAmount: string; // lamports (buy) or token base units (sell)
  expectedOutput: string; // token base units (buy) or lamports (sell)
  limitAmount: string; // max lamports spent (buy) or min lamports received (sell)
  slippageBps: number;
  priceImpactPct: number | null;
  fees: FeeEstimate;
}

export class TradeUnavailableError extends Error {
  constructor(
    public code: "not_found" | "migration_pending" | "unsupported" | "no_balance",
    message: string,
  ) {
    super(message);
  }
}

function impactPct(spotOut: number, actualOut: number): number | null {
  if (!Number.isFinite(spotOut) || spotOut <= 0) return null;
  return Math.max(0, ((spotOut - actualOut) / spotOut) * 100);
}

export async function buildTradeTransaction(
  conn: Connection,
  p: {
    mint: PublicKey;
    user: PublicKey;
    side: "buy" | "sell";
    amount: bigint; // lamports for buy, token base units for sell
    slippageBps: number;
    priorityMicroLamports: number;
    feePayer?: PublicKey;
  },
): Promise<PreparedTx & { quote: TradeQuote }> {
  const slippagePct = p.slippageBps / 100;
  const amount = new BN(p.amount.toString());
  const tokenProgram = await tokenProgramOf(conn, p.mint);
  if (!tokenProgram) throw new TradeUnavailableError("not_found", "Token mint not found on-chain.");

  const sdk = new OnlinePumpSdk(conn);
  const curveInfo = await conn.getAccountInfo(bondingCurvePda(p.mint));
  if (!curveInfo) throw new TradeUnavailableError("unsupported", "This token is not a Pump.fun bonding-curve token.");
  const bcPeek = PUMP_SDK.decodeBondingCurve(curveInfo);

  // ---------- bonding curve
  if (!bcPeek.complete && !bcPeek.virtualTokenReserves.isZero()) {
    const units = 200_000;
    const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
    let ixs: TransactionInstruction[];
    let expected: BN;
    let spot: number;
    if (p.side === "buy") {
      const st = await sdk.fetchBuyState(p.mint, p.user, tokenProgram);
      expected = getBuyTokenAmountFromSolAmount({
        global,
        feeConfig,
        mintSupply: st.bondingCurve.tokenTotalSupply,
        bondingCurve: st.bondingCurve,
        amount,
        quoteMint: NATIVE_MINT,
        quoteTransferFee: st.quoteTransferFee,
      });
      if (expected.isZero()) throw new TradeUnavailableError("unsupported", "Amount too small to buy any tokens.");
      ixs = await PUMP_SDK.buyV2Instructions({
        global,
        bondingCurveAccountInfo: st.bondingCurveAccountInfo,
        bondingCurve: st.bondingCurve,
        associatedUserAccountInfo: st.associatedUserAccountInfo,
        mint: p.mint,
        user: p.user,
        amount: expected,
        quoteAmount: amount,
        slippage: slippagePct,
        tokenProgram,
      });
      spot = Number(amount.toString()) / (Number(st.bondingCurve.virtualQuoteReserves.toString()) / Number(st.bondingCurve.virtualTokenReserves.toString()));
    } else {
      let st;
      try {
        st = await sdk.fetchSellState(p.mint, p.user, tokenProgram);
      } catch {
        throw new TradeUnavailableError("no_balance", "You do not hold this token.");
      }
      expected = getSellSolAmountFromTokenAmount({
        global,
        feeConfig,
        mintSupply: st.bondingCurve.tokenTotalSupply,
        bondingCurve: st.bondingCurve,
        amount,
        quoteTransferFee: st.quoteTransferFee,
      });
      ixs = await PUMP_SDK.sellV2Instructions({
        global,
        bondingCurveAccountInfo: st.bondingCurveAccountInfo,
        bondingCurve: st.bondingCurve,
        mint: p.mint,
        user: p.user,
        amount,
        quoteAmount: expected,
        slippage: slippagePct,
        tokenProgram,
      });
      spot = Number(amount.toString()) * (Number(st.bondingCurve.virtualQuoteReserves.toString()) / Number(st.bondingCurve.virtualTokenReserves.toString()));
    }
    const limitAmount =
      p.side === "buy"
        ? amount.add(amount.muln(Math.floor(slippagePct * 10)).divn(1000))
        : expected.sub(expected.muln(Math.floor(slippagePct * 10)).divn(1000));
    const prepared = await compile(conn, p.feePayer ?? p.user, [...computeBudget(units, p.priorityMicroLamports), ...ixs]);
    return {
      ...prepared,
      quote: {
        venue: "bonding_curve",
        side: p.side,
        inputAmount: amount.toString(),
        expectedOutput: expected.toString(),
        limitAmount: limitAmount.toString(),
        slippageBps: p.slippageBps,
        priceImpactPct: impactPct(spot, Number(expected.toString())),
        fees: estimateFees(1, units, p.priorityMicroLamports),
      },
    };
  }

  // ---------- migrated: PumpSwap canonical pool
  const pool = canonicalPumpPoolPda(p.mint);
  const amm = new OnlinePumpAmmSdk(conn);
  let state;
  try {
    state = await amm.swapSolanaState(pool, p.user);
  } catch {
    throw new TradeUnavailableError(
      "migration_pending",
      "The bonding curve is complete and the liquidity pool is not available yet. Trading resumes after migration.",
    );
  }
  if (!state.pool.quoteMint.equals(NATIVE_MINT))
    throw new TradeUnavailableError("unsupported", "Only SOL-quoted pools are supported.");
  const units = 300_000;
  let ixs: TransactionInstruction[];
  let expected: BN;
  let limitAmount: BN;
  const spotRatio = Number(state.poolBaseAmount.toString()) / Number(state.poolQuoteAmount.toString());
  let spot: number;
  if (p.side === "buy") {
    const r = buyQuoteInput({
      quote: amount,
      slippage: slippagePct,
      baseReserve: state.poolBaseAmount,
      quoteReserve: state.poolQuoteAmount,
      virtualQuoteReserves: state.pool.virtualQuoteReserves,
      globalConfig: state.globalConfig,
      baseMintAccount: state.baseMintAccount,
      baseMint: state.baseMint,
      coinCreator: state.pool.coinCreator,
      creator: state.pool.creator,
      feeConfig: state.feeConfig,
      quoteMint: state.pool.quoteMint,
      isMayhemMode: state.pool.isMayhemMode,
      creatorFeeBps: state.pool.creatorFeeBps,
      quoteTransferFee: state.quoteTransferFee,
    } as Parameters<typeof buyQuoteInput>[0]);
    expected = r.base;
    limitAmount = r.maxQuote;
    ixs = await PUMP_AMM_SDK.buyQuoteInput(state, amount, slippagePct);
    spot = Number(amount.toString()) * spotRatio;
  } else {
    const ata = getAssociatedTokenAddressSync(p.mint, p.user, true, tokenProgram);
    const ataInfo = await conn.getAccountInfo(ata);
    if (!ataInfo) throw new TradeUnavailableError("no_balance", "You do not hold this token.");
    const r = sellBaseInput({
      base: amount,
      slippage: slippagePct,
      baseReserve: state.poolBaseAmount,
      quoteReserve: state.poolQuoteAmount,
      virtualQuoteReserves: state.pool.virtualQuoteReserves,
      feeBucketsTotal: state.pool.protocolFees.add(state.pool.creatorFees),
      globalConfig: state.globalConfig,
      baseMintAccount: state.baseMintAccount,
      baseMint: state.baseMint,
      coinCreator: state.pool.coinCreator,
      creator: state.pool.creator,
      feeConfig: state.feeConfig,
      quoteMint: state.pool.quoteMint,
      isMayhemMode: state.pool.isMayhemMode,
      creatorFeeBps: state.pool.creatorFeeBps,
      quoteTransferFee: state.quoteTransferFee,
    } as Parameters<typeof sellBaseInput>[0]);
    expected = r.uiQuote;
    limitAmount = r.minQuote;
    ixs = await PUMP_AMM_SDK.sellBaseInput(state, amount, slippagePct);
    spot = Number(amount.toString()) / spotRatio;
  }
  const prepared = await compile(conn, p.feePayer ?? p.user, [...computeBudget(units, p.priorityMicroLamports), ...ixs]);
  return {
    ...prepared,
    quote: {
      venue: "pump_amm",
      side: p.side,
      inputAmount: amount.toString(),
      expectedOutput: expected.toString(),
      limitAmount: limitAmount.toString(),
      slippageBps: p.slippageBps,
      priceImpactPct: impactPct(spot, Number(expected.toString())),
      fees: estimateFees(1, units, p.priorityMicroLamports),
    },
  };
}

// ------------------------------------------------------------------ balances

export async function fetchBalances(conn: Connection, owner: PublicKey, mint?: PublicKey) {
  const lamports = await conn.getBalance(owner, "confirmed");
  let tokenAmount: string | null = null;
  if (mint) {
    const program = await tokenProgramOf(conn, mint);
    if (program) {
      const ata = getAssociatedTokenAddressSync(mint, owner, true, program);
      const info = await conn.getAccountInfo(ata, "confirmed");
      tokenAmount = info ? unpackAccount(ata, info, program).amount.toString() : "0";
    }
  }
  return { lamports, tokenAmount };
}
