import { Schema, model } from "mongoose";

const MediaSchema = new Schema({
    code: {type: String, required: true, unique: true},
    file_id: {type: String, required: true, unique: true},
    file_name: {type: String, required: true},
    caption: {type: String}
}, {timestamps: true})

const Media = model('Media', MediaSchema);

export default Media;