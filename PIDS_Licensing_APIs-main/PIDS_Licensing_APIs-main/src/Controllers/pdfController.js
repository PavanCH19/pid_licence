const fs = require("fs");
const path = require("path");
const PDFDocument = require('pdfkit');
const os = require('os');

async function createLicensePDF(customer_name, system_id, password) {
  return new Promise((resolve, reject) => {
    try {
      // Create a temporary file path
      const tempFilePath = path.join(os.tmpdir(), `license-${system_id}-${Date.now()}.pdf`);
      
      // Create a PDF document
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4'
      });
      
      // Pipe the PDF to a write stream
      const writeStream = fs.createWriteStream(tempFilePath);
      doc.pipe(writeStream);
      
      // Add content to the PDF
      doc.fontSize(20).text('Crown Fence Solar License', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(14).text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
      doc.moveDown();
      
      doc.fontSize(12).text(`Dear ${customer_name},`, { align: 'left' });
      doc.moveDown();
      
      doc.text('Thank you for choosing Crown Fence Solar. Below are your license activation credentials:', { align: 'left' });
      doc.moveDown();
      
      // Add a box for credentials
      doc.rect(50, doc.y, 500, 100).stroke();
      doc.moveDown(0.5);
      
      // Add credentials inside the box
      doc.fontSize(12).text(`System ID: ${system_id}`, { align: 'left', indent: 20 });
      doc.moveDown();
      doc.text(`Password: ${password}`, { align: 'left', indent: 20 });
      doc.moveDown(3);
      
      doc.text('Please keep these credentials secure and do not share them with anyone.', { align: 'left' });
      doc.moveDown(2);
      
      doc.text('Thank you.', { align: 'left' });
      doc.moveDown();
      doc.text('Best regards,', { align: 'left' });
      doc.text('Crown Fence Solar Support Team', { align: 'left' });
      
      // Finalize PDF
      doc.end();
      
      // When the stream is finished, resolve with the file path
      writeStream.on('finish', () => {
        resolve(tempFilePath);
      });
      
      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  createLicensePDF
};
