import { z } from 'zod';

const streamedPayloadSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.unknown()),
]);

const responseStatusEnum = z.enum([
  'in_progress',
  'completed',
  'requires_action',
  'cancelled',
  'failed',
  'queued',
]);

const responseUsageSchema = z
  .object({
    total_tokens: z.number().int(),
    input_tokens: z.number().int(),
    output_tokens: z.number().int(),
    audio_input_tokens: z.number().int(),
    audio_output_tokens: z.number().int(),
  })
  .partial();

const responseObjectSchema = z
  .object({
    id: z.string(),
    object: z.literal('response'),
    model: z.string(),
    status: responseStatusEnum,
    created_at: z.number().int(),
    expires_at: z.number().int().nullable().optional(),
    finished_at: z.number().int().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    usage: responseUsageSchema.optional(),
  })
  .passthrough();

const responseErrorSchema = z.object({
  type: z.string(),
  code: z.string().optional(),
  message: z.string(),
  param: z.string().nullable().optional(),
  details: z.record(z.unknown()).optional(),
});

const baseEventSchema = z.object({
  event_id: z.string(),
  response_id: z.string(),
});

const responseCreatedEventSchema = baseEventSchema.extend({
  type: z.literal('response.created'),
  response: responseObjectSchema,
});

const responseUpdatedEventSchema = baseEventSchema.extend({
  type: z.literal('response.updated'),
  response: responseObjectSchema,
});

const responseCompletedEventSchema = baseEventSchema.extend({
  type: z.literal('response.completed'),
  response: responseObjectSchema,
});

const responseFailedEventSchema = baseEventSchema.extend({
  type: z.literal('response.failed'),
  response: responseObjectSchema,
  error: responseErrorSchema.optional(),
});

const responseCanceledEventSchema = baseEventSchema.extend({
  type: z.literal('response.canceled'),
  response: responseObjectSchema,
});

const responseOutputTextDeltaEventSchema = baseEventSchema.extend({
  type: z.literal('response.output_text.delta'),
  output_index: z.number().int(),
  delta: streamedPayloadSchema,
});

const responseOutputTextDoneEventSchema = baseEventSchema.extend({
  type: z.literal('response.output_text.done'),
  output_index: z.number().int(),
  value: streamedPayloadSchema.optional(),
});

const responseOutputAudioDeltaEventSchema = baseEventSchema.extend({
  type: z.literal('response.output_audio.delta'),
  output_index: z.number().int(),
  delta: streamedPayloadSchema,
});

const responseOutputAudioDoneEventSchema = baseEventSchema.extend({
  type: z.literal('response.output_audio.done'),
  output_index: z.number().int(),
});

const responseOutputImageDeltaEventSchema = baseEventSchema.extend({
  type: z.literal('response.output_image.delta'),
  output_index: z.number().int(),
  delta: streamedPayloadSchema,
});

const responseOutputImageDoneEventSchema = baseEventSchema.extend({
  type: z.literal('response.output_image.done'),
  output_index: z.number().int(),
});

const responseOutputToolCallDeltaEventSchema = baseEventSchema.extend({
  type: z.literal('response.output_tool_call.delta'),
  output_index: z.number().int(),
  tool_call_id: z.string(),
  delta: streamedPayloadSchema,
});

const responseOutputToolCallDoneEventSchema = baseEventSchema.extend({
  type: z.literal('response.output_tool_call.done'),
  output_index: z.number().int(),
  tool_call_id: z.string(),
  result: streamedPayloadSchema.optional(),
});

const responseErrorEventSchema = baseEventSchema.extend({
  type: z.literal('response.error'),
  error: responseErrorSchema,
});

export const realtimeResponseEventSchema = z.discriminatedUnion('type', [
  responseCreatedEventSchema,
  responseUpdatedEventSchema,
  responseCompletedEventSchema,
  responseFailedEventSchema,
  responseCanceledEventSchema,
  responseOutputTextDeltaEventSchema,
  responseOutputTextDoneEventSchema,
  responseOutputAudioDeltaEventSchema,
  responseOutputAudioDoneEventSchema,
  responseOutputImageDeltaEventSchema,
  responseOutputImageDoneEventSchema,
  responseOutputToolCallDeltaEventSchema,
  responseOutputToolCallDoneEventSchema,
  responseErrorEventSchema,
]);

export type RealtimeResponseEvent = z.infer<typeof realtimeResponseEventSchema>;
export type ResponseStatus = z.infer<typeof responseStatusEnum>;
export type ResponseObject = z.infer<typeof responseObjectSchema>;
export type ResponseError = z.infer<typeof responseErrorSchema>;
