import jwt from "jsonwebtoken";

const signingSecret =
  process.env.JWT_SECRET ||
  process.env.TOKEN_SIGNING_SECRET ||
  process.env.TOTEM_JWT_SECRET;

if (!signingSecret) {
  console.error("Missing JWT signing secret. Set JWT_SECRET, TOKEN_SIGNING_SECRET, or TOTEM_JWT_SECRET.");
  process.exit(1);
}

const token = jwt.sign(
  {
    user_id: 1,
    role: "owner"
  },
  signingSecret,
  { expiresIn: "1h" }
);

console.log(token);
