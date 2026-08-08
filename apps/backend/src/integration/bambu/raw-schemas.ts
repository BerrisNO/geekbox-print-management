import { z } from 'zod';

/**
 * Zod schemas for RAW Bambu payloads. These are UNVERIFIED community-documented
 * shapes (A-01..A-05). They NEVER leave the ACL — only the normalizer reads them
 * and produces internal types. Every schema is tolerant: unknown fields are
 * ignored (Zod strips by default), and nearly every field is optional/nullable
 * so schema drift degrades gracefully rather than throwing (NFR-MA-03).
 */

// POST /v1/user-service/user/login
export const loginResponseSchema = z
  .object({
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    // Some deployments require an email verification code before issuing a token.
    loginType: z.string().optional(),
    tfaKey: z.string().optional(),
    uid: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
export type RawLoginResponse = z.infer<typeof loginResponseSchema>;

// GET /v1/iot-service/api/user/bind — device list
export const bindDeviceSchema = z
  .object({
    dev_id: z.string().nullish(),
    name: z.string().nullish(),
    dev_product_name: z.string().nullish(),
    dev_model_name: z.string().nullish(),
    online: z.boolean().nullish(),
  })
  .passthrough();
export const bindResponseSchema = z
  .object({
    devices: z.array(bindDeviceSchema).optional(),
  })
  .passthrough();
export type RawBindResponse = z.infer<typeof bindResponseSchema>;

// GET /v1/user-service/my/tasks — task history
// Per-slot filament mapping used by a task. `ams` is a GLOBAL tray index
// (0-15 across AMS units, 254 = external holder); weights are grams.
export const amsDetailSchema = z
  .object({
    ams: z.number().nullish(),
    sourceColor: z.string().nullish(),
    targetColor: z.string().nullish(), // AABBGGRR or RRGGBBAA hex
    filamentId: z.string().nullish(), // Bambu filament code, e.g. "GFA00"
    filamentType: z.string().nullish(), // material, e.g. "PLA"
    weight: z.number().nullish(), // grams used from this slot
  })
  .passthrough();
export const taskSchema = z
  .object({
    id: z.union([z.string(), z.number()]).nullish(),
    designTitle: z.string().nullish(),
    title: z.string().nullish(),
    deviceId: z.string().nullish(),
    startTime: z.string().nullish(),
    endTime: z.string().nullish(),
    costTime: z.number().nullish(), // seconds
    status: z.union([z.string(), z.number()]).nullish(),
    cover: z.string().nullish(), // signed image URL
    weight: z.number().nullish(), // total grams
    length: z.number().nullish(), // total mm
    amsDetailMapping: z.array(amsDetailSchema).nullish(),
  })
  .passthrough();
export const tasksResponseSchema = z
  .object({
    hits: z.array(taskSchema).optional(),
    total: z.number().optional(),
  })
  .passthrough();
export type RawTasksResponse = z.infer<typeof tasksResponseSchema>;

// MQTT topic device/{serial}/report — print status push
export const amsTraySchema = z
  .object({
    id: z.union([z.string(), z.number()]).nullish(),
    tray_type: z.string().nullish(), // null on empty trays
    tray_color: z.string().nullish(), // AABBGGRR or RRGGBBAA hex
    remain: z.number().nullish(), // percent remaining
  })
  .passthrough();
export const amsUnitSchema = z
  .object({
    id: z.union([z.string(), z.number()]).nullish(),
    tray: z.array(amsTraySchema).nullish(),
  })
  .passthrough();
export const reportPrintSchema = z
  .object({
    gcode_state: z.string().nullish(), // IDLE|RUNNING|PAUSE|FINISH|FAILED
    mc_percent: z.number().nullish(),
    layer_num: z.number().nullish(),
    total_layer_num: z.number().nullish(),
    mc_remaining_time: z.number().nullish(), // minutes
    nozzle_temper: z.number().nullish(),
    bed_temper: z.number().nullish(),
    chamber_temper: z.number().nullish(),
    subtask_name: z.string().nullish(),
    ams: z
      .object({ ams: z.array(amsUnitSchema).nullish() })
      .passthrough()
      .nullish(),
  })
  .passthrough();
export const reportMessageSchema = z
  .object({
    print: reportPrintSchema.optional(),
  })
  .passthrough();
export type RawReportMessage = z.infer<typeof reportMessageSchema>;
