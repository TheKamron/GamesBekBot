import { Schema, model } from "mongoose";

const UserSchema = new Schema({
  userId: { type: Number, required: true, unique: true },
  first_name: String,
  username: String,
  language_code: String,
  joinedAt: {type: Date, default: Date.now},
}, {timestamps: true});


const User = new model("User", UserSchema)

export default User;
