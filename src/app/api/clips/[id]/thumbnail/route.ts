import { route, requireUser, err } from "@/lib/api";
import { q, q1 } from "@/lib/db";
import { putPublicFile, sniffImage } from "@/lib/storage";
import { MAX_IMAGE_BYTES } from "@/lib/validation";

/** Owner sets a thumbnail (a frame captured in the browser, or a custom image). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const clip = await q1("select id from clips where id = $1 and creator_id = $2", [id, user.id]);
  if (!clip) throw err.notFound("Clip not found.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || file.size > MAX_IMAGE_BYTES) throw err.badRequest("Attach an image up to 4 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) throw err.badRequest("Thumbnail must be PNG, JPEG or WebP.");
  const url = await putPublicFile(`thumbnails/${id}-${Date.now()}.${type.split("/")[1].replace("jpeg", "jpg")}`, bytes, type);
  await q("update clips set thumbnail_url = $2, updated_at = now() where id = $1", [id, url]);
  return { thumbnailUrl: url };
});
