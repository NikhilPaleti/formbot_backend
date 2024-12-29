const mongoose = require('mongoose');

const formbotSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    commands: [{
        type: { type: String, required: true },
        content: { type: String }
    }],
    workspace: { type: String, required: true },
    folderName: { type: String, required: true },
    opened: { type: Number, default: 0 },
    filled_forms: { type: [[String]], default: [] }
});

module.exports = mongoose.model('Formbot', formbotSchema); 
// enum: ['output-text', 'output-image', 'input-text', 'input-number'], //Paste in "type", if some issues come up