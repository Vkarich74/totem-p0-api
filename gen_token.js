import jwt from "jsonwebtoken";

const token = jwt.sign(
  {
    user_id: 1,
    role: "owner"
  },
  "totem_dev_secret_2026",
  { expiresIn: "1h" }
);

console.log(token);