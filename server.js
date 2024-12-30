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
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed methods
    credentials: true 
}));
app.use(express.json());


mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));

// Testing if sheez even works
app.get('/', (req, res) => {
    res.send('Hello from the backend!');
});

// User will be created, and a corresponding workspace.
app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if the username or email already exists
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
            sharedWith: [{ email: newUser.email, access: 'edit' }], // User can access their own workspace. Obviously.
            folders: ["root"],
        });

        await newWorkspace.save(); 
        res.status(201).json({ message: 'User registered and workspace created' });
        // console.log('USER REGISTERED AND WORKSPACE CREATED');
    } catch (error) {
        console.log("/register", error.message);
        res.status(500).json({ error: error.message });
    }
});

// // Create Workspace
// app.post('/workspace', async (req, res) => {
//     try {
//         const { name, sharedWith } = req.body; 
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
        const { sharedWith } = req.body;

        const registeredEmails = [];
        for (let i = 0; i < sharedWith.length; i++) {
            const user = await User.findOne({ email: sharedWith[i].email }).select('email');
            if (!user) {
                return res.status(400).json({ error: `Email ${sharedWith[i].email} is not a registered user` });
            }
            registeredEmails.push(user.email); 
        }

        // Check for existing users in sharedWith
        const workspace = await Workspace.findOne({ name: id });
        if (!workspace) return res.status(404).json({ error: `Workspace ${id} not found!` });

        for (let i = 0; i < sharedWith.length; i++) {
            const existingUser = workspace.sharedWith.find(user => user.email === sharedWith[i].email);
            if (existingUser) {
                return res.status(400).json({ error: `User with email ${sharedWith[i].email} already exists in the workspace` });
            }
        }

        const updatedWorkspace = await Workspace.findOneAndUpdate(
            { name: id }, 
            { $addToSet: { sharedWith: { $each: sharedWith } } }, 
            { new: true }
        );

        res.json({ message: 'Workspace updated', workspace: updatedWorkspace });
    } catch (error) {
        console.log("/updateWorkspace/:id", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Login User
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({error: `User with email ${email} not found!`});

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({error: 'Invalid Credentials'});

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.log("/login", error.message)
        res.status(500).json({ error: error.message });
    }
});

// Fetch Workspaces
app.get('/fetchWorkspaces', async (req, res) => {
    try {
        const { email } = req.query; 

        const workspaces = await Workspace.find({
            'sharedWith.email': email 
        });

        res.json(workspaces);
    } catch (error) {
        console.log("/fetchWorkspaces", error.message)
        res.status(500).json({ error: error.message });
    }
});

// Get User Details
app.get('/alluserdetails', async (req, res) => {
    try {
        const { username, email } = req.query; 
        
        const query = {};
        if (username) {
            query.username = username;
        }
        if (email) {
            query.email = email;
        }

        const user = await User.findOne(query).select('username email'); 
        if (!user) return res.status(404).json({error: `${username} ain't found mate!`});

        res.json(user);
    } catch (error) {
        console.log("/alluserdetails", error.message)
        res.status(500).json({ error: error.message });
    }
});

// Add Folder
app.post('/addFolder/:id/folder', async (req, res) => {
    try {
        const { id } = req.params; 
        const { name } = req.body; 

        // Check if the folder name already exists in the workspace
        const workspace = await Workspace.findOne({ name: id });
        if (!workspace) return res.status(404).json({error: `Could not find workspace ${id}`});

        if (workspace.folders.includes(name)) {
            return res.status(400).json({ error: `Folder ${name} already exists in this workspace` });
        }

        const updatedWorkspace = await Workspace.findOneAndUpdate(
            { name: id }, 
            { $push: { folders: name } }, 
            { new: true } 
        );

        if (!updatedWorkspace) return res.status(404).json({error: `Could not fird the workspace ${id}`});

        res.json({ message: 'Folder added', workspace: updatedWorkspace });
    } catch (error) {
        console.log('/addFolder/:id/folder', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Fetch Folders
app.get('/fetchFolders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const workspace = await Workspace.findOne({ name: id }).select('folders');
        if (!workspace) return res.status(404).json({error: `Could not find workspace ${id}`});
        res.json(workspace.folders);
    } catch (error) {
        console.log('/fetchFolders/:id', error.message)
        res.status(500).json({ error: error.message });
    }
});

// Delete Folder
app.delete('/deleteFolder/:id/folder/:folderName', async (req, res) => {
    try {
        const { id, folderName } = req.params;

        const updatedWorkspace = await Workspace.findOneAndUpdate(
            { name: id },
            { $pull: { folders: folderName } }, 
            { new: true }
        );

        if (!updatedWorkspace) return res.status(404).json({error: `Could not find workspace ${id}`});

        res.json({ message: 'Folder deleted', workspace: updatedWorkspace });
    } catch (error) {
        console.log("/deleteFolder/:id/folder/:folderName", error.message)
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
            opened: opened || 0, 
            // filledForms: filledForms || 0, // Not necessary...... Until it might be
            filled_forms: filled_forms || [] 
        });
        await formbot.save();

        res.status(201).json({ message: 'Formbot created', formbot });
    } catch (error) {
        console.log("/createFormbot", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Modify Formbot
app.put('/modifyFormbot/:workspaceId/:folderName/:formbotId', async (req, res) => {
    try {
        const { workspaceId, folderName, formbotId } = req.params;
        const { name, commands, opened, filled_forms } = req.body;

        // Find the existing formbot by workspace, folder, and formbot ID
        const existingFormbot = await Formbot.findOne({
            workspace: workspaceId,
            folderName: folderName,
            name: formbotId
        });
        if (!existingFormbot) return res.status(404).json({error: `${formbotId} formbot not found`});

        // Update properties if provided
        if (name) existingFormbot.name = name;
        if (commands) existingFormbot.commands = commands;
        if (opened !== undefined) existingFormbot.opened = opened;
        if (filled_forms && Array.isArray(filled_forms)) {
            existingFormbot.filled_forms.push(filled_forms); 
            // existingFormbot.filled_forms.push(...filled_forms); // Diff way to append. This "replaces"
        }

        const updatedFormbot = await existingFormbot.save();
        res.json({ message: 'Formbot updated', updatedFormbot });
    } catch (error) {
        console.log('/modifyFormbot/:workspaceId/:folderName/:formbotId', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Delete Formbot
app.delete('/deleteFormbot/:id', async (req, res) => {
    try {
        const formbot = await Formbot.findOneAndDelete({ name: req.params.id }); 
        if (!formbot) return res.status(404).json({error: `${req.params.id} formbot not found`});


        res.json({ message: 'Formbot deleted' });
    } catch (error) {
        console.log('/deleteFormbot/:id', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Fetch Formbots
app.get('/fetchFormbots', async (req, res) => {
    try {
        const { workspaceId, folderName } = req.query;
        
       
        const formbots = await Formbot.find({ 
            workspace: workspaceId, 
            folderName: folderName 
        });
        // console.log("formbots", formbots)

        if (!formbots.length) return res.status(404).send('No formbots found for the specified workspace and folder');
        res.json(formbots);
    } catch (error) {
        console.log("/fetchFormbots", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Fetch Formbot by ID
app.get('/fetchFormbot/:workspaceId/:folderName/:formbotId', async (req, res) => {
    try {
        const { workspaceId, folderName, formbotId } = req.params;

        const formbot = await Formbot.findOne({
            workspace: workspaceId,
            folderName: folderName,
            name: formbotId
        });
        if (!formbot) return res.status(404).json({error: `${formbotId} formbot not found`});

        res.json(formbot); 
    } catch (error) {
        console.log('/fetchFormbot/:workspaceId/:folderName/:formbotId', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Update User Details
app.put('/updateUser', async (req, res) => {
    try {
        const { oldUsername, oldEmail, newUsername, newEmail, oldPassword, newPassword } = req.body;
        // console.log("oldusername", oldUsername,"oldemails", oldEmail,"newusername", newUsername,"newemail", newEmail, oldPassword, newPassword)

        const user = await User.findOne({ $or: [{ username: oldUsername }, { email: oldEmail }] });
        if (!user) return res.status(404).json({ error: `${oldUsername} user not found` });

        // To ensure unique username
        if (newUsername) {
            const existingUsername = await User.findOne({ username: newUsername });
            if (existingUsername) {
                return res.status(400).json({ error: `Username ${newUsername} already exists` });
            }
            
            user.username = newUsername;
            await Workspace.updateMany(
                { name: `${oldUsername}_workspace` }, 
                { $set: { name: `${newUsername}_workspace` } } 
            );
            
            await Formbot.updateMany(
                { workspace: `${oldUsername}_workspace` }, 
                { $set: { workspace: `${newUsername}_workspace` } } 
            );
        }

        // Ensure unique email
        if (newEmail) {
            const existingEmail = await User.findOne({ email: newEmail });
            if (existingEmail) {
                return res.status(400).json({ error: `Email ${newEmail} already exists` });
            }
            user.email = newEmail;
            await Workspace.updateMany(
                { 'sharedWith.email': oldEmail },
                { $set: { 'sharedWith.$.email': newEmail } }
            );
        }

        // Update password if old and new passwords are provided
        if (oldPassword && newPassword) {
            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) return res.status(400).json({ error: 'Old password does not match' });

            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
        }

        await user.save(); 
        res.json({ message: 'User updated successfully', user });
    } catch (error) {
        console.log("/updateUser", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 

