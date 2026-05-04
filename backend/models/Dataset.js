const mongoose = require('mongoose');

const DatasetSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    path: {
        type: String,
        default: '' // Virtual path for folder structure
    },
    isDirectory: {
        type: Boolean,
        default: false
    },
    gridFsId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'fs.files' // Reference to the GridFS file
    },
    size: {
        type: Number,
        default: 0
    },
    mimeType: {
        type: String
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure unique names within the same path
DatasetSchema.index({ name: 1, path: 1 }, { unique: true });

module.exports = mongoose.model('Dataset', DatasetSchema);
