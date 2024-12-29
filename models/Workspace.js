const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    sharedWith: [
        {
            email: { type: String, required: true },
            access: { type: String, enum: ['view', 'edit'], required: true }
        }
    ],
    folders: { type: [String], default: [] }
});

module.exports = mongoose.model('Workspace', workspaceSchema); 