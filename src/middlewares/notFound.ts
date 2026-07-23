import { Request, Response } from "express";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Không tìm thấy route ${req.method} ${req.originalUrl}` });
}
