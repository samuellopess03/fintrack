export type ImportFileFormat = "csv" | "ofx";

export type ImportJobPayload = {
  userId: string;
  fileId: string;
  fileName: string;
  fileFormat: ImportFileFormat;
  uploadedAt: string;
};

export interface ImportJobQueue {
  enqueue(payload: ImportJobPayload): Promise<void>;
}
