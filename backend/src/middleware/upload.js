const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = process.env.UPLOAD_DIR || './uploads';

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `cv-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and DOCX files are allowed'), false);
  }
};

const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
});

// Single CV upload (job seeker)
const uploadSingle = upload.single('cv');

// Multiple CV upload (recruiter batch)
const uploadMultiple = upload.array('cvs', 50);

module.exports = { uploadSingle, uploadMultiple };
