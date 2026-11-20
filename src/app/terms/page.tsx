import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 px-4 py-10 text-sm leading-relaxed text-ff-muted [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white">
      <h1 className="text-3xl font-bold tracking-tight text-white">Terms of service</h1>
      <p>Draft — must be reviewed by qualified counsel before public launch. Last updated 20 November 2026.</p>
      <h2>1. What Fragfun is</h2>
      <p>
        Fragfun is a software interface that lets you upload gaming clips and, using your own Solana wallet, create and trade tokens through
        third-party Pump.fun smart contracts. Fragfun is not a broker, exchange, custodian or investment adviser, and never holds your funds or keys.
      </p>
      <h2>2. No affiliation</h2>
      <p>Fragfun is independent and is not affiliated with, endorsed by or sponsored by Rockstar Games, Take-Two Interactive, Pump.fun or any game publisher.</p>
      <h2>3. Your content</h2>
      <p>
        You may only upload clips you own or have the rights to share. You grant Fragfun a licence to host, transcode and display them. You are responsible
        for your uploads and for the tokens you create, including their names, images and descriptions.
      </p>
      <h2>4. Prohibited use</h2>
      <p>
        No infringing, illegal, hateful, sexual or violent content; no impersonation; no misleading claims of returns or endorsements; no wash trading, artificial
        volume, market manipulation or automated engagement abuse.
      </p>
      <h2>5. Risk</h2>
      <p>
        Meme tokens are speculative and highly volatile and may lose all value. Blockchain transactions are irreversible. Network fees are not refundable.
        Nothing on Fragfun is financial advice, and rankings do not indicate quality or future performance.
      </p>
      <h2 id="takedown">6. Copyright takedowns</h2>
      <p>
        If you believe content on Fragfun infringes your rights, use the Report button on the clip and choose “Copyright”, including proof of ownership, or contact
        the operator&apos;s designated agent. We remove infringing clips from Fragfun promptly. Tokens already on-chain cannot be deleted by Fragfun, but their pages
        and clips can be hidden.
      </p>
      <h2>7. Moderation and suspension</h2>
      <p>We may hide content or suspend accounts that violate these terms. Administrators cannot access or move funds in your wallet.</p>
      <h2>8. Fees</h2>
      <p>Fragfun currently charges no platform fee. Solana network fees and Pump.fun protocol fees apply and are shown before you sign.</p>
    </article>
  );
}
