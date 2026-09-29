/**
 * AIConversation — per-user chat history for developer-analyst or interview flows.
 * Ownership is enforced by route-level authorization and model indexing.
 */
import mongoose, { Schema, type Document } from 'mongoose';

export type AIConversationType = 'DEVELOPER_ANALYST' | 'INTERVIEW';
export type AIMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AIConversationDocument extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  type: AIConversationType;
  messages: AIMessage[];
  contextVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

const aiMessageSchema = new Schema<AIMessage>(
  {
    role: { type: String, enum: ['USER', 'ASSISTANT', 'SYSTEM'], required: true },
    content: { type: String, required: true, maxlength: 12000 },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const aiConversationSchema = new Schema<AIConversationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 200 },
    type: { type: String, enum: ['DEVELOPER_ANALYST', 'INTERVIEW'], required: true },
    messages: { type: [aiMessageSchema], default: [] },
    contextVersion: { type: String, default: '1.0' }
  },
  { timestamps: true }
);

aiConversationSchema.index({ userId: 1, createdAt: -1 });

export const AIConversation = mongoose.model<AIConversationDocument>('AIConversation', aiConversationSchema);
