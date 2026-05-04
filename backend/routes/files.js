const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const Dataset = require('../models/Dataset');
const { Readable } = require('stream');

// Use Memory Storage for stability
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Get file tree from MongoDB
router.get('/', async (req, res) => {
    try {
        console.log("Fetching file tree from MongoDB...");
        const datasets = await Dataset.find().sort({ isDirectory: -1, name: 1 });
        
        const buildTree = (items, currentPath = '') => {
            const levelItems = items.filter(item => item.path === currentPath);
            return levelItems.map(item => {
                const fullPath = item.path ? `${item.path}/${item.name}` : item.name;
                return {
                    id: item._id,
                    name: item.name,
                    isDirectory: item.isDirectory,
                    path: fullPath,
                    size: item.size,
                    modified: item.uploadedAt,
                    gridFsId: item.gridFsId,
                    children: item.isDirectory ? buildTree(items, fullPath) : null
                };
            });
        };

        const tree = buildTree(datasets);
        res.json(tree);
    } catch (err) {
        console.error("Error fetching file tree:", err);
        res.status(500).json({ error: err.message });
    }
});

// Create virtual folder in MongoDB
router.post('/folder', async (req, res) => {
    const { name, parentPath } = req.body;
    try {
        const newFolder = new Dataset({
            name,
            path: parentPath || '',
            isDirectory: true
        });
        await newFolder.save();
        res.json({ message: 'Folder created', folder: newFolder });
    } catch (err) {
        if (err.code === 11000) {
            res.status(400).json({ error: 'A folder or file with this name already exists in this path.' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// Upload file to GridFS (Manual Stream)
router.post('/upload', upload.single('file'), async (req, res) => {
    console.log("--- Upload Request Received ---");
    if (!req.file) {
        return res.status(400).json({ error: 'No file received' });
    }

    try {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'uploads'
        });

        const filename = `${Date.now()}-${req.file.originalname}`;
        const uploadStream = bucket.openUploadStream(filename, {
            metadata: {
                originalName: req.file.originalname,
                path: req.body.path || ''
            }
        });

        // Convert buffer to stream and pipe to GridFS
        const readableStream = new Readable();
        readableStream.push(req.file.buffer);
        readableStream.push(null);
        
        readableStream.pipe(uploadStream);

        uploadStream.on('error', (err) => {
            console.error("GridFS Upload Error:", err);
            res.status(500).json({ error: 'Failed to stream to MongoDB' });
        });

        uploadStream.on('finish', async () => {
            try {
                const newFile = new Dataset({
                    name: req.file.originalname,
                    path: req.body.path || '',
                    isDirectory: false,
                    gridFsId: uploadStream.id,
                    size: req.file.size,
                    mimeType: req.file.mimetype
                });
                await newFile.save();
                console.log("File saved successfully to MongoDB:", req.file.originalname);
                res.json({ message: 'File uploaded to MongoDB', file: newFile });
            } catch (err) {
                console.error("Error saving metadata:", err);
                res.status(500).json({ error: 'File data saved but metadata failed' });
            }
        });

    } catch (err) {
        console.error("Upload process error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Stream file content from GridFS
router.get('/content/:id', async (req, res) => {
    try {
        const dataset = await Dataset.findById(req.params.id);
        if (!dataset || dataset.isDirectory) {
            return res.status(404).send('File not found');
        }

        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'uploads'
        });

        const downloadStream = bucket.openDownloadStream(dataset.gridFsId);
        downloadStream.pipe(res);

        downloadStream.on('error', (err) => {
            res.status(404).send('Error streaming file');
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Delete from MongoDB and GridFS
router.delete('/:id', async (req, res) => {
    try {
        const item = await Dataset.findById(req.params.id);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'uploads'
        });

        if (item.isDirectory) {
            const currentPath = item.path ? `${item.path}/${item.name}` : item.name;
            
            const deleteRecursive = async (pathPrefix) => {
                const children = await Dataset.find({ path: pathPrefix });
                for (const child of children) {
                    const childPath = `${child.path}/${child.name}`;
                    if (child.isDirectory) {
                        await deleteRecursive(childPath);
                    } else if (child.gridFsId) {
                        await bucket.delete(child.gridFsId);
                    }
                    await Dataset.findByIdAndDelete(child._id);
                }
            };
            
            await deleteRecursive(currentPath);
            await Dataset.findByIdAndDelete(item._id);
        } else {
            if (item.gridFsId) {
                await bucket.delete(item.gridFsId);
            }
            await Dataset.findByIdAndDelete(item._id);
        }

        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
