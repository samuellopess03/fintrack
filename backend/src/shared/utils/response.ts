import { z } from "zod";

const metaSchema = z.object({ requestId: z.string() });

export function withMeta<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({ data: dataSchema, meta: metaSchema.optional() });
}
