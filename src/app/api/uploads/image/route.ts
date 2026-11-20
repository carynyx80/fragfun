import { randomUUID } from "node:crypto";
import { route, requireUser, limit, err } from "@/lib/api";
import { MAX_IMAGE_BYTES } from "@/lib/validation";
import { putPublicFile, sniffImage } from "@/lib/storage";

/** Image upload for token images and avatars. Type is detected from content, not the filename. */
export const POST = route(async (req) => {
  const user = await requireUser();
  limit(req, "image-upload", 30, 60 * 60_000, user.id);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const purpose = String(form?.get("purpose") ?? "token");
  if (!(file instanceof Blob)) throw err.badRequest("Attach an image file.");
  if (!["token", "avatar"].includes(purpose)) throw err.badRequest("Invalid purpose.");
  if (file.size > MAX_IMAGE_BYTES) throw err.badRequest("Images must be 4 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) throw err.badRequest("Upload a PNG, JPEG, WebP or GIF image.");
  const ext = type.split("/")[1].replace("jpeg", "jpg");
  const url = await putPublicFile(`${purpose}s/${user.id}/${randomUUID()}.${ext}`, bytes, type);
  return { url };
});
