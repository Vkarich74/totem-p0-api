import { Request, Response } from "express";

export const authResolveHandler = async (req: Request, res: Response) => {
  try {
    // TODO: replace with real session logic
    // For now: stub always public

    return res.status(200).json({
      role: "public"
    });

  } catch (err) {
    return res.status(500).json({
      error: "auth_resolve_failed"
    });
  }
};
