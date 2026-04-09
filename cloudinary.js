// ============================================================
// src/config/cloudinary.js
// ============================================================
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage untuk foto profil
const storageFoto = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'guruNgaji/profil',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill' }],
  },
});

// Storage untuk materi (PDF, video, audio)
const storageMateri = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith('video');
    const isAudio = file.mimetype.startsWith('audio');
    return {
      folder: 'guruNgaji/materi',
      resource_type: isVideo ? 'video' : isAudio ? 'video' : 'raw',
      allowed_formats: ['mp4', 'mp3', 'pdf', 'mov'],
    };
  },
});

// Storage untuk dokumen KTP/Ijazah
const storageDokumen = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'guruNgaji/dokumen',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
  },
});

module.exports = {
  uploadFoto:    multer({ storage: storageFoto }),
  uploadMateri:  multer({ storage: storageMateri, limits: { fileSize: 500 * 1024 * 1024 } }), // 500MB
  uploadDokumen: multer({ storage: storageDokumen }),
  cloudinary,
};
