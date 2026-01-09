import mongoose from "mongoose";

const ConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String }
}, { timestamps: true });

const Config = mongoose.model("Config", ConfigSchema);
export default Config;
