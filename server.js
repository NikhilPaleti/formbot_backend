const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Workspace = require('./models/Workspace');
const Formbot = require('./models/Formbot')

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: true, // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed methods
    credentials: true // Allow credentials if needed
}));
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));

// Sample route
app.get('/', (req, res) => {
    res.send('Hello from the backend!');
});

// User will be created, and a corresponding workspace.
app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if the username already exists
        const existingUser = await User.findOne({ username });
        const existingEmail = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ error: Username>> `${existingUser.username} already exists` });
        }
        if (existingEmail){
            return res.status(400).json({ error: Email>> `${existingEmail.email} already exists` });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });

        await newUser.save();
        
        // Create a workspace for the new user
        const newWorkspace = new Workspace({
            name: `${username}_workspace`,
            sharedWith: [{ email: newUser.email, access: 'edit' }], // User can access their own workspace
            folders: [],
        });

        await newWorkspace.save(); // Save the workspace
        res.status(201).json({ message: 'User registered and workspace created' });
        console.log('USER REGISTERED AND WORKSPACE CREATED');
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: error.message });
    }
});

// // Create Workspace
// app.post('/workspace', async (req, res) => {
//     try {
//         const { name, sharedWith } = req.body; // Expecting name and sharedWith array
//         const newWorkspace = new Workspace({
//             name,
//             sharedWith
//         });

//         await newWorkspace.save();
//         res.status(201).json({ message: 'Workspace created' });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// Update Workspace
app.put('/updateWorkspace/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { sharedWith } = req.body; // Expecting updated sharedWith array

        const updatedWorkspace = await Workspace.findOneAndUpdate(
            { name: id }, // Use the workspace name instead of ID
            { $addToSet: { sharedWith: { $each: sharedWith } } }, // Append new values to sharedWith
            { new: true }
        );
        if (!updatedWorkspace) return res.status(404).send('Workspace not found');

        res.json({ message: 'Workspace updated', workspace: updatedWorkspace });
    } catch (error) {
        console.log(error.message)
        res.status(500).json({ error: error.message });
    }
});

// Login User
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).send('User not found');

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).send('Invalid credentials');

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Fetch Workspaces
app.get('/fetchWorkspaces', async (req, res) => {
    try {
        const { email } = req.query; // Expecting email as a query parameter

        const workspaces = await Workspace.find({
            'sharedWith.email': email // Find workspaces where the email is in the sharedWith array
        });

        res.json(workspaces);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get User Details
app.get('/alluserdetails', async (req, res) => {
    try {
        const { username, email } = req.query; // Expecting either username or email as query parameters
        
        // Build the query based on the provided parameters
        const query = {};
        if (username) {
            query.username = username;
        }
        if (email) {
            query.email = email;
        }

        const user = await User.findOne(query).select('username email'); // Select only username and email
        if (!user) return res.status(404).send('User not found');

        console.log("Sent User")
        res.json(user);
    } catch (error) {
        console.log(error.message)
        res.status(500).json({ error: error.message });
    }
});

// Add Folder
app.post('/addFolder/:id/folder', async (req, res) => {
    try {
        const { id } = req.params; // Name of workspace
        const { name } = req.body; // Name of folder

        // Check if the folder name already exists in the workspace
        const workspace = await Workspace.findOne({ name: id });
        if (!workspace) return res.status(404).send('Workspace not found');

        if (workspace.folders.includes(name)) {
            return res.status(400).json({ error: 'Folder name already exists in this workspace' });
        }

        const updatedWorkspace = await Workspace.findOneAndUpdate(
            { name: id }, // Find workspace by name
            { $push: { folders: name } }, // Add new folder name to the folders array
            { new: true } // Return the updated workspace
        );

        if (!updatedWorkspace) return res.status(404).send('Workspace not found');

        res.json({ message: 'Folder added', workspace: updatedWorkspace });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: error.message });
    }
});

// Fetch Folders
app.get('/fetchFolders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const workspace = await Workspace.findOne({ name: id }).select('folders'); // Find workspace by ID and select only folders
        if (!workspace) return res.status(404).send('Workspace not found');
        res.json(workspace.folders);
    } catch (error) {
        console.log(error.message)
        res.status(500).json({ error: error.message });
    }
});

// Delete Folder
app.delete('/deleteFolder/:id/folder/:folderName', async (req, res) => {
    try {
        const { id, folderName } = req.params;

        const updatedWorkspace = await Workspace.findOneAndUpdate(
            { name: id },
            { $pull: { folders: folderName } }, // Remove folder by name
            { new: true }
        );

        if (!updatedWorkspace) return res.status(404).send('Workspace not found');

        res.json({ message: 'Folder deleted', workspace: updatedWorkspace });
    } catch (error) {
        console.log(error.message)
        res.status(500).json({ error: error.message });
    }
});

// Create Formbot
app.post('/createFormbot', async (req, res) => {
    try {
        const { name, commands, workspaceId, folderName, opened, filled_forms } = req.body;

        // Check if the formbot name already exists in the specified folder
        const existingFormbot = await Formbot.findOne({ name, folderName, workspace: workspaceId });
        if (existingFormbot) {
            return res.status(400).json({ error: 'Formbot of same name already exists!' });
        }

        const formbot = new Formbot({
            name,
            commands,
            workspace: workspaceId,
            folderName,
            opened: opened || 0, // Use default if not provided
            // filledForms: filledForms || 0, // Use default if not provided
            filled_forms: filled_forms || [] // Use default if not provided
        });
        await formbot.save();

        res.status(201).json({ message: 'Formbot created', formbot });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: error.message });
    }
});

// Modify Formbot
app.put('/modifyFormbot/:id', async (req, res) => {
    try {
        const { name, commands, opened, filled_forms } = req.body;
        console.log(name, commands, opened, filled_forms);
        const { id } = req.params; // id is the old name

        // Find the existing formbot by name (id)
        const existingFormbot = await Formbot.findOne({ name: id });
        if (!existingFormbot) return res.status(404).send('Formbot not found');

        // Check if the new name is different from the existing name
        if (name && name !== existingFormbot.name) {
            // Update the name of the formbot
            existingFormbot.name = name;
        }

        // Update commands if provided
        if (commands !== undefined) existingFormbot.commands = commands;

        // Update opened if provided
        if (opened !== undefined) existingFormbot.opened = opened;

        // Append new filled_forms if provided
        if (filled_forms && Array.isArray(filled_forms)) {
            existingFormbot.filled_forms.push(filled_forms); // Append new lists
            // existingFormbot.filled_forms.push(...filled_forms); // Append new entries
        }

        // Save the updated formbot
        const updatedFormbot = await existingFormbot.save();
        res.json({ message: 'Formbot updated', updatedFormbot });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: error.message });
    }
});

// Delete Formbot
app.delete('/deleteFormbot/:id', async (req, res) => {
    try {
        const formbot = await Formbot.findOneAndDelete({ name: req.params.id }); // Find by name instead of ID
        if (!formbot) return res.status(404).send('Formbot not found');


        res.json({ message: 'Formbot deleted' });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: error.message });
    }
});

// Fetch Formbots
app.get('/fetchFormbots', async (req, res) => {
    try {
        const { workspaceId, folderName } = req.query;
        
        // Find formbots directly based on workspaceId and folderName
        const formbots = await Formbot.find({ 
            workspace: workspaceId, 
            folderName: folderName 
        });
        console.log("formbots", formbots)

        if (!formbots.length) return res.status(404).send('No formbots found for the specified workspace and folder');
        res.json(formbots);
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: error.message });
    }
});

// Fetch Formbot by ID
app.get('/fetchFormbot/:id', async (req, res) => {
    try {
        const formbot = await Formbot.findOne({ name: req.params.id }); // Find formbot by name
        if (!formbot) return res.status(404).send('Formbot not found');

        res.json(formbot); // Return the formbot details
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: error.message });
    }
});

// Update User Details
app.put('/updateUser', async (req, res) => {
    try {
        const { oldUsername, oldEmail, newUsername, newEmail, oldPassword, newPassword } = req.body;
        console.log("oldusername", oldUsername,"oldemails", oldEmail,"newusername", newUsername,"newemail", newEmail, oldPassword, newPassword)

        // Find user by old username or email
        const user = await User.findOne({ $or: [{ username: oldUsername }, { email: oldEmail }] });
        if (!user) return res.status(404).send('User not found');

        // Check for unique username
        if (newUsername) {
            const existingUsername = await User.findOne({ username: newUsername });
            if (existingUsername) {
                return res.status(400).json({ error: `Username ${newUsername} already exists` });
            }
            // Update the workspace name if username is changed
            user.username = newUsername;
            await Workspace.updateMany(
                { name: `${oldUsername}_workspace` }, // Find the workspace by old username
                { $set: { name: `${newUsername}_workspace` } } // Correctly update to new username
            );
        }

        // Check for unique email
        if (newEmail) {
            const existingEmail = await User.findOne({ email: newEmail });
            if (existingEmail) {
                return res.status(400).json({ error: `Email ${newEmail} already exists` });
            }
            user.email = newEmail;
            // Update all instances of old email in Workspace documents
            await Workspace.updateMany(
                { 'sharedWith.email': oldEmail },
                { $set: { 'sharedWith.$.email': newEmail } }
            );
        }

        // Update password if old and new passwords are provided
        if (oldPassword && newPassword) {
            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) return res.status(400).send('Old password does not match');

            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
        }

        await user.save(); // Save the updated user details
        res.json({ message: 'User updated successfully', user });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 
