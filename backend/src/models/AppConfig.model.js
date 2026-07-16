import mongoose from 'mongoose';

const appConfigSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, index: true },
        value: { type: mongoose.Schema.Types.Mixed, required: true }
    },
    { timestamps: true }
);

const AppConfig = mongoose.model('AppConfig', appConfigSchema);
export { AppConfig };
export default AppConfig;
