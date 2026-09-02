import { z } from "zod";
import { disputeReasonCodes } from "@shared/types";

export const createDisputeSchema = z.object({
  transactionId: z.string().min(1),
  reasonCode: z.enum(disputeReasonCodes),
  description: z
    .string()
    .trim()
    .min(20, "Provide enough detail for the operations team to investigate.")
    .max(500, "Keep the narrative concise and focused on the dispute.")
});

export const createSessionSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.")
});
