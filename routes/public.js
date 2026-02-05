import express from "express"
import publicRoutes from "../routes_public/index.js"

const router = express.Router()

router.use("/", publicRoutes)

export default router
