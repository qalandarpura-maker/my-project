import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const EXPIRES = process.env.JWT_EXPIRES || "7d";

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username },
    SECRET,
    { expiresIn: EXPIRES }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}