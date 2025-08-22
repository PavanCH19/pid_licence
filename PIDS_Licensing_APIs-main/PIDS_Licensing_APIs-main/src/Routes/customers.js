const express = require('express');
const multer = require('multer');

const {
    createLicence,
    updateLicence,
    deleteLicence,
    getLicenceInfo,
    getAllLicenses,
    //generateToken
} = require('../Controllers/licenseController.js');

// Set up multer for file upload
// const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });

// Create an instance of the Express Router
const routers = express.Router();

//Route for uploading files
// routers.post('/uploadFile', upload.single('file'), async (req, res) => {
//     try {
//         const data = await uploadFile(req.file || null);
//         res.status(data.code).json(data);
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// });

//Route for creating licenses
routers.post('/createLicence', async (req, res) => {
    try {
        const data = await createLicence(req.body);
        res.status(data.code).json(data);
    } catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }
});

routers.put('/updateLicence', async (req, res) => {
    try{
        const data = await updateLicence(req.query, req.body);
        res.status(data.code).json(data);
    }catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }
    
});

routers.delete('/deleteLicence', async (req, res) => {
    try{
        const data = await deleteLicence(req.query);
        res.status(data.code).json(data);
    }catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }

});

routers.get('/getLicenceInfo', async (req, res) => {
    try{
        const data = await getLicenceInfo();
        res.status(data.code).json(data);
    }catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }

});

routers.get('/getAllLicenses', async (req, res) => {
    try{
        const data = await getAllLicenses();
        res.status(data.code).json(data);
    }catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }

});

// routers.post('/generateToken', async (req, res) => {
//     try{
//         const data = await generateToken(req.body);
//         res.status(data.code).json(data);
//     }catch (error) {
//         console.error(error)
//         res.status(500).json({ success: false, message: error.message });
//     }
// });

// Export the router
module.exports = routers;