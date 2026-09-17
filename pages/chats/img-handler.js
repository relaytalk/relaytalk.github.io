import { supabase } from '../../utils/supabase.js';

console.log('✨ Image handler initialized');

// ============================================================
// STATE
// ============================================================
let selectedColor = null;
let colorPickerVisible = false;
let isImagePickerOpen = false;
let selectedImages = [];
let currentImageIndex = 0;
let uploadInProgress = false;
let isUploadingMultiple = false;

const IMGBB_API_KEY = '82e49b432e2ee14921f7d0cd81ba5551';

// ============================================================
// EXPORTS
// ============================================================
window.selectColor = selectColor;
window.hideColorPicker = hideColorPicker;
window.showColorPicker = showColorPicker;
window.showImagePicker = showImagePicker;
window.closeImagePicker = closeImagePicker;
window.openCamera = openCamera;
window.openGallery = openGallery;
window.viewImageFullscreen = viewImageFullscreen;
window.closeImageViewer = closeImageViewer;
window.downloadImage = downloadImage;
window.shareImage = shareImage;
window.handleImageLoad = handleImageLoad;
window.handleImageError = handleImageError;
window.cancelImageUpload = cancelImageUpload;
window.sendImagePreview = sendImagePreview;
window.createImageMessageHTML = createImageMessageHTML;
window.uploadImageFromPreview = uploadImageFromPreview;
window.removeSelectedColor = removeSelectedColor;
window.cancelColorSelection = cancelColorSelection;
window.handleImageSelect = handleImageSelect;
window.isMobileChrome = isMobileChrome;
window.fixImgBBUrls = fixImgBBUrls;
window.prevImage = prevImage;
window.nextImage = nextImage;

if (window.chatModules) window.chatModules.imgHandlerLoaded = true;

// ============================================================
// MOBILE DETECTION
// ============================================================
function isMobileChrome() {
    const ua = navigator.userAgent;
    return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg/i.test(ua);
}

function isIOSChrome() {
    return /CriOS/i.test(navigator.userAgent);
}

// ============================================================
// URL FIXER
// ============================================================
function fixImgBBUrls(url) {
    if (!url || !url.includes('ibb.co')) return url;

    let fixedUrl = url;

    if (isMobileChrome() || isIOSChrome()) {
        fixedUrl = fixedUrl.replace('https://ibb.co/', 'https://i.ibb.co/');
        fixedUrl = fixedUrl.replace('http://ibb.co/', 'https://i.ibb.co/');

        if (!fixedUrl.includes('.jpg') && !fixedUrl.includes('.png') && !fixedUrl.includes('.gif')) {
            fixedUrl += '.jpg';
        }
    }

    return ensureHttpsUrl(fixedUrl);
}

function ensureHttpsUrl(url) {
    if (!url) return url;
    let u = url.replace(/^http:\/\//, 'https://');
    if (u.startsWith('https://https://')) u = u.replace('https://https://', 'https://');
    return u;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initializeColorPicker();
        setupSlashHandler();
        setupFileInputListeners();
        setupColorPickerClickOutside();
        if (isMobileChrome() || isIOSChrome()) applyMobileChromeFixes();
        setTimeout(addColorPickerToDOM, 100);
    }, 300);
});

function applyMobileChromeFixes() {
    document.body.classList.add('chrome-mobile');
    document.body.style.overscrollBehavior = 'none';
}

// ============================================================
// COLOR PICKER
// ============================================================
function addColorPickerToDOM() {
    if (document.getElementById('colorPickerOverlay')) return;

    const html = `
        <div class="color-picker-overlay" id="colorPickerOverlay" style="display: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="font-size: 0.9rem; color: #666;">Choose text color</div>
                <button style="background: rgba(0,122,204,0.1); border: none; color: #007acc; width: 28px; height: 28px; border-radius: 50%; font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="cancelColorSelection()">×</button>
            </div>
            <div class="color-picker-grid">
                <div class="color-option" data-color="red" onclick="selectColor('red')"></div>
                <div class="color-option" data-color="green" onclick="selectColor('green')"></div>
                <div class="color-option" data-color="blue" onclick="selectColor('blue')"></div>
                <div class="color-option" data-color="white" onclick="selectColor('white')"></div>
                <div class="color-option" data-color="black" onclick="selectColor('black')"></div>
                <div class="color-option" data-color="yellow" onclick="selectColor('yellow')"></div>
                <div class="color-option" data-color="cyan" onclick="selectColor('cyan')"></div>
                <div class="color-option" data-color="purple" onclick="selectColor('purple')"></div>
                <div class="color-option" data-color="pink" onclick="selectColor('pink')"></div>
                <div class="color-option" data-color="orange" onclick="selectColor('orange')"></div>
            </div>
            <div class="color-picker-footer">
                <button class="color-clear-btn" onclick="removeSelectedColor()">Clear Color</button>
            </div>
        </div>
    `;

    const wrapper = document.querySelector('.message-input-wrapper');
    if (wrapper) wrapper.insertAdjacentHTML('beforebegin', html);
    else document.body.insertAdjacentHTML('beforeend', html);
}

function initializeColorPicker() {
    setTimeout(() => {
        if (!document.getElementById('colorPickerOverlay')) addColorPickerToDOM();
    }, 200);
}

function setupColorPickerClickOutside() {
    document.addEventListener('click', (e) => {
        if (!colorPickerVisible) return;
        const picker = document.getElementById('colorPickerOverlay');
        const input = document.getElementById('messageInput');
        if (picker && !picker.contains(e.target) && e.target !== input) cancelColorSelection();
    });
}

function showColorPicker() {
    const picker = document.getElementById('colorPickerOverlay');
    if (!picker) { addColorPickerToDOM(); return setTimeout(showColorPicker, 50); }
    colorPickerVisible = true;
    window.colorPickerVisible = true;
    picker.style.display = 'flex';
    setTimeout(() => picker.style.opacity = '1', 10);
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
}

function hideColorPicker() {
    const picker = document.getElementById('colorPickerOverlay');
    if (!picker) return;
    colorPickerVisible = false;
    window.colorPickerVisible = false;
    picker.style.opacity = '0';
    setTimeout(() => picker.style.display = 'none', 150);
}

function cancelColorSelection() {
    hideColorPicker();
    const input = document.getElementById('messageInput');
    if (input && input.value === '/') {
        input.value = '';
        if (typeof autoResize === 'function') autoResize(input);
    }
}

function removeSelectedColor() {
    selectedColor = null;
    window.selectedColor = null;
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
    if (typeof showToast === 'function') showToast('Color cleared', '↩️', 800);
    setTimeout(() => {
        hideColorPicker();
        const input = document.getElementById('messageInput');
        if (input) {
            input.focus();
            if (input.value === '/') {
                input.value = '';
                if (typeof autoResize === 'function') autoResize(input);
            }
        }
    }, 500);
}

function selectColor(color) {
    selectedColor = color;
    window.selectedColor = color;
    document.querySelectorAll('.color-option').forEach(o => {
        o.classList.toggle('selected', o.dataset.color === color);
    });
    if (typeof showToast === 'function') showToast(`${color} selected`, '🎨', 800);
    setTimeout(() => {
        hideColorPicker();
        const input = document.getElementById('messageInput');
        if (input) {
            input.focus();
            if (input.value === '/') {
                input.value = '';
                if (typeof autoResize === 'function') autoResize(input);
            }
        }
    }, 500);
}

function setupSlashHandler() {
    const input = document.getElementById('messageInput');
    if (!input) return;

    input.addEventListener('input', function(e) {
        const text = e.target.value;
        if (text === '/' && !colorPickerVisible) showColorPicker();
        else if (colorPickerVisible && text !== '/') hideColorPicker();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && colorPickerVisible) {
            e.preventDefault();
            cancelColorSelection();
        }
    });
}

// ============================================================
// IMAGE PICKER
// ============================================================
function showImagePicker() {
    const user = window.getCurrentUser ? window.getCurrentUser() : null;
    if (!user) return showToast('Please login', '⚠️');

    setTimeout(() => {
        isImagePickerOpen = true;
        const picker = document.getElementById('imagePickerOverlay');
        if (picker) {
            picker.style.display = 'flex';
            setTimeout(() => picker.style.opacity = '1', 10);
            document.body.style.overflow = 'hidden';
        }
    }, isMobileChrome() ? 50 : 0);
}

function closeImagePicker() {
    if (uploadInProgress) return;
    isImagePickerOpen = false;
    const picker = document.getElementById('imagePickerOverlay');
    if (picker) {
        picker.style.opacity = '0';
        setTimeout(() => {
            picker.style.display = 'none';
            document.body.style.overflow = '';
        }, 150);
    }
}

function openCamera() {
    const input = document.getElementById('cameraInput');
    if (input) { input.value = ''; setTimeout(() => input.click(), 200); }
}

function openGallery() {
    const input = document.getElementById('galleryInput');
    if (input) { input.value = ''; setTimeout(() => input.click(), 200); }
}

function setupFileInputListeners() {
    const cam = document.getElementById('cameraInput');
    const gal = document.getElementById('galleryInput');
    if (cam) cam.addEventListener('change', handleImageSelect);
    if (gal) gal.addEventListener('change', handleImageSelect);
}

// ============================================================
// IMAGE SELECT
// ============================================================
function handleImageSelect(event) {
    try {
        const fileInput = event.target;
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            return showToast('No images selected', '⚠️');
        }

        const files = Array.from(fileInput.files);
        const validFiles = [];
        const maxSize = 20 * 1024 * 1024;

        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            if (file.size > maxSize) {
                showToast(`${file.name} is too large`, '⚠️');
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length === 0) {
            fileInput.value = '';
            return showToast('Please select valid images', '⚠️');
        }

        if (validFiles.length > 10) validFiles.splice(10);

        selectedImages = validFiles;
        currentImageIndex = 0;
        createMultiImagePreview();
    } catch (error) {
        console.error('Image select error:', error);
        showToast('Error selecting images', '❌');
    }
}

function createMultiImagePreview() {
    if (!selectedImages || selectedImages.length === 0) return showToast('No images', '⚠️');

    const file = selectedImages[currentImageIndex];
    const reader = new FileReader();

    reader.onload = function(e) {
        const previewHTML = `
            <div class="image-preview-overlay" id="imagePreviewOverlay">
                <div class="image-preview-container">
                    <div class="preview-header">
                        <h3>Image Preview</h3>
                        <button class="preview-close" onclick="cancelImageUpload()">×</button>
                    </div>
                    <div class="preview-image-wrapper">
                        ${selectedImages.length > 1 ? `<div class="preview-counter">${currentImageIndex + 1}/${selectedImages.length}</div>` : ''}
                        <div class="preview-image-container">
                            <img src="${e.target.result}" alt="Preview" class="preview-image">
                        </div>
                        ${selectedImages.length > 1 ? `
                            <div style="display:flex;justify-content:space-between;margin-top:15px;">
                                <button onclick="prevImage()" class="preview-btn cancel" ${currentImageIndex === 0 ? 'disabled' : ''}>← Previous</button>
                                <button onclick="nextImage()" class="preview-btn cancel" ${currentImageIndex === selectedImages.length - 1 ? 'disabled' : ''}>Next →</button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="preview-actions">
                        <button class="preview-btn cancel" onclick="cancelImageUpload()">Cancel</button>
                        <button class="preview-btn send" onclick="uploadImageFromPreview()">
                            ${selectedImages.length > 1 ? `Send ${selectedImages.length} Images` : 'Send Image'}
                        </button>
                    </div>
                    <div class="preview-info">
                        <p>File: ${file.name}</p>
                        <p>Size: ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('imagePreviewOverlay');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', previewHTML);
        closeImagePicker();
        setTimeout(() => {
            const p = document.getElementById('imagePreviewOverlay');
            if (p) p.style.opacity = '1';
        }, 10);
    };

    reader.readAsDataURL(file);
}

function prevImage() {
    if (currentImageIndex > 0) { currentImageIndex--; updatePreviewImage(); }
}

function nextImage() {
    if (currentImageIndex < selectedImages.length - 1) { currentImageIndex++; updatePreviewImage(); }
}

function updatePreviewImage() {
    const img = document.querySelector('.preview-image-container img');
    const counter = document.querySelector('.preview-counter');
    if (!img || !selectedImages[currentImageIndex]) return;

    const file = selectedImages[currentImageIndex];
    const reader = new FileReader();
    reader.onload = function(e) {
        img.src = e.target.result;
        if (counter) counter.textContent = `${currentImageIndex + 1}/${selectedImages.length}`;
    };
    reader.readAsDataURL(file);
}

// ============================================================
// CANCEL
// ============================================================
function cancelImageUpload() {
    const cam = document.getElementById('cameraInput');
    const gal = document.getElementById('galleryInput');
    if (cam) cam.value = '';
    if (gal) gal.value = '';

    selectedImages = [];
    currentImageIndex = 0;
    uploadInProgress = false;
    isUploadingMultiple = false;

    const preview = document.getElementById('imagePreviewOverlay');
    if (preview) {
        preview.style.opacity = '0';
        setTimeout(() => preview.remove(), 150);
    }
}

function sendImagePreview() {
    if (!selectedImages || selectedImages.length === 0) return showToast('No images', '⚠️');
    uploadImageFromPreview();
}

// ============================================================
// UPLOAD
// ============================================================
async function uploadImageFromPreview() {
    if (uploadInProgress) return;

    const user = window.getCurrentUser ? window.getCurrentUser() : null;
    const friend = window.getChatFriend ? window.getChatFriend() : null;

    if (!user) { showToast('Please login', '⚠️'); cancelImageUpload(); return; }
    if (!friend) { showToast('No chat friend', '⚠️'); cancelImageUpload(); return; }
    if (!selectedImages || selectedImages.length === 0) { cancelImageUpload(); return; }

    uploadInProgress = true;
    isUploadingMultiple = selectedImages.length > 1;

    const preview = document.getElementById('imagePreviewOverlay');
    if (preview) {
        preview.style.opacity = '0';
        setTimeout(() => preview.remove(), 150);
    }

    if (typeof showLoading === 'function') {
        showLoading(true, isUploadingMultiple ? `Uploading 1/${selectedImages.length}...` : 'Uploading...');
    }

    try {
        if (isUploadingMultiple) {
            await uploadMultipleImagesSequentially();
        } else {
            await uploadImageToImgBB(selectedImages[0]);
        }
    } catch (error) {
        console.error('Upload failed:', error);
        showToast('Failed to upload images', '❌');
    } finally {
        uploadInProgress = false;
        isUploadingMultiple = false;
        if (typeof showLoading === 'function') showLoading(false);
    }
}

async function uploadMultipleImagesSequentially() {
    const total = selectedImages.length;
    let uploaded = 0;
    let failed = 0;

    for (let i = 0; i < selectedImages.length; i++) {
        try {
            if (typeof showLoading === 'function') {
                showLoading(true, `Uploading ${i + 1}/${total}...`);
            }
            await uploadImageToImgBB(selectedImages[i]);
            uploaded++;
        } catch (e) {
            failed++;
        }
    }

    if (uploaded > 0) {
        let msg = `Sent ${uploaded} image${uploaded > 1 ? 's' : ''}`;
        if (failed > 0) msg += `, ${failed} failed`;
        showToast(msg, uploaded > 0 ? '✅' : '⚠️', 3000);
    }
}

async function uploadImageToImgBB(file) {
    if (!file) throw new Error('No image file');

    const fileCopy = new File([file], file.name, { type: file.type, lastModified: Date.now() });

    let processedFile;
    try {
        processedFile = await compressImage(fileCopy);
    } catch (e) {
        processedFile = fileCopy;
    }

    const formData = new FormData();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', processedFile);
    formData.append('name', `relaytalk_${Date.now()}_${file.name.replace(/\s+/g, '_')}`);

    const timeout = isMobileChrome() || isIOSChrome() ? 45000 : 25000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        credentials: 'omit'
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

    const data = await response.json();
    if (!data.success) throw new Error(data.error?.message || 'Upload failed');
    if (!data.data?.url) throw new Error('No image URL');

    let imageUrl = fixImgBBUrls(data.data.url);
    let thumbnailUrl = fixImgBBUrls(data.data.thumb?.url || data.data.url);

    await sendImageMessage(imageUrl, thumbnailUrl);
}

// ============================================================
// COMPRESSION
// ============================================================
async function compressImage(file, maxSize = 1024 * 1024) {
    return new Promise((resolve) => {
        if (!file || file.size <= maxSize) return resolve(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let w = img.width, h = img.height;
                const MAX = isMobileChrome() || isIOSChrome() ? 1200 : 1600;

                if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }

                canvas.width = w;
                canvas.height = h;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);

                let quality = isMobileChrome() || isIOSChrome() ? 0.75 : 0.85;
                const tryCompress = () => {
                    canvas.toBlob((blob) => {
                        if (!blob) return resolve(file);
                        if (blob.size <= maxSize || quality <= 0.4) {
                            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                        } else {
                            quality -= 0.1;
                            tryCompress();
                        }
                    }, 'image/jpeg', quality);
                };
                tryCompress();
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

// ============================================================
// SEND IMAGE MESSAGE
// ============================================================
async function sendImageMessage(imageUrl, thumbnailUrl) {
    if (window.isSending) return;

    const user = window.getCurrentUser ? window.getCurrentUser() : null;
    const friend = window.getChatFriend ? window.getChatFriend() : null;
    const client = window.getSupabaseClient ? window.getSupabaseClient() : supabase;

    if (!user || !friend || !client) {
        showToast('Missing user data', '❌');
        return;
    }

    window.isSending = true;

    try {
        const messageData = {
            sender_id: user.id,
            receiver_id: friend.id,
            content: '',
            image_url: imageUrl,
            thumbnail_url: thumbnailUrl,
            created_at: new Date().toISOString()
        };

        if (selectedColor) {
            messageData.color = selectedColor;
            selectedColor = null;
            window.selectedColor = null;
        }

        const { data, error } = await client
            .from('direct_messages')
            .insert(messageData)
            .select()
            .single();

        if (error) throw error;

        if (typeof playSentSound === 'function') playSentSound();
        if (typeof addMessageToUI === 'function') addMessageToUI(data, false);

        const cam = document.getElementById('cameraInput');
        const gal = document.getElementById('galleryInput');
        if (cam) cam.value = '';
        if (gal) gal.value = '';

        if (window.isTyping !== undefined) window.isTyping = false;
        if (window.typingTimeout) { clearTimeout(window.typingTimeout); window.typingTimeout = null; }
        if (typeof sendTypingStatus === 'function') sendTypingStatus(false);

        const input = document.getElementById('messageInput');
        if (input) input.focus({ preventScroll: true });
    } catch (error) {
        console.error('Send image failed:', error);
        showToast('Failed to send image', '❌');
    } finally {
        window.isSending = false;
    }
}

// ============================================================
// IMAGE MESSAGE HTML — medium, uniform size
// ============================================================
function createImageMessageHTML(msg, isSent, colorAttr, time) {
    let imageUrl = msg.image_url || '';
    let thumbnailUrl = msg.thumbnail_url || imageUrl;
    const content = msg.content || '';

    imageUrl = fixImgBBUrls(imageUrl);
    thumbnailUrl = fixImgBBUrls(thumbnailUrl);

    return `
        <div class="message ${isSent ? 'sent' : 'received'} image-message" data-message-id="${msg.id}" ${colorAttr}>
            <div class="message-image-container" onclick="viewImageFullscreen('${imageUrl}')">
                <img src="${thumbnailUrl}"
                     alt="Shared image"
                     class="message-image"
                     onload="handleImageLoad(this)"
                     onerror="handleImageError(this, '${imageUrl}')"
                     loading="lazy"
                     decoding="async">
                <div class="image-overlay">
                    <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:white;">
                        <path d="M21,19V5C21,3.9 20.1,3 19,3H5C3.9,3 3,3.9 3,5V19C3,20.1 3.9,21 5,21H19C20.1,21 21,20.1 21,19M8.5,13.5L11,16.5L14.5,12L19,18H5L8.5,13.5Z"/>
                    </svg>
                </div>
            </div>
            ${content ? `<div class="image-caption">${content}</div>` : ''}
            <div class="message-time">${time}</div>
        </div>
    `;
}

// ============================================================
// IMAGE LOAD HANDLERS
// ============================================================
function handleImageLoad(img) {
    img.style.opacity = '1';
    img.classList.add('loaded');
}

function handleImageError(img, originalUrl) {
    let fixed = fixImgBBUrls(originalUrl);
    if (fixed !== originalUrl) { img.src = fixed; return; }
    fixed = ensureHttpsUrl(originalUrl);
    if (fixed !== originalUrl) { img.src = fixed; return; }
    img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="%23ccc" d="M21,19V5C21,3.9 20.1,3 19,3H5C3.9,3 3,3.9 3,5V19C3,20.1 3.9,21 5,21H19C20.1,21 21,20.1 21,19M8.5,13.5L11,16.5L14.5,12L19,18H5L8.5,13.5Z"/></svg>';
    img.style.opacity = '1';
    img.classList.add('loaded');
}

// ============================================================
// FULLSCREEN VIEWER
// ============================================================
function viewImageFullscreen(imageUrl) {
    const existing = document.getElementById('imageViewerOverlay');
    if (existing) existing.remove();

    const fixedUrl = fixImgBBUrls(imageUrl);

    const html = `
        <div class="image-viewer-overlay" id="imageViewerOverlay">
            <button class="viewer-close" onclick="closeImageViewer()">
                <svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>
            </button>
            <div class="viewer-image-container">
                <img src="${fixedUrl}" alt="Image" class="viewer-image"
                     onload="this.style.opacity='1';this.classList.add('loaded')"
                     onerror="handleImageViewerError(this,'${fixedUrl}')">
            </div>
            <div class="viewer-actions">
                <button class="viewer-action-btn" onclick="downloadImage('${fixedUrl}')">
                    <svg viewBox="0 0 24 24"><path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/></svg>
                    <span>Download</span>
                </button>
                <button class="viewer-action-btn" onclick="shareImage('${fixedUrl}')">
                    <svg viewBox="0 0 24 24"><path d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19C20.92,17.39 19.61,16.08 18,16.08Z"/></svg>
                    <span>Share</span>
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    setTimeout(() => {
        const v = document.getElementById('imageViewerOverlay');
        if (v) v.style.opacity = '1';
    }, 10);
}

function handleImageViewerError(img, url) {
    let fixed = fixImgBBUrls(url);
    if (fixed !== url) { img.src = fixed; return; }
    fixed = ensureHttpsUrl(url);
    if (fixed !== url) { img.src = fixed; return; }
    img.style.opacity = '1';
    img.classList.add('loaded');
}

function closeImageViewer() {
    const v = document.getElementById('imageViewerOverlay');
    if (v) {
        v.style.opacity = '0';
        setTimeout(() => v.remove(), 150);
    }
}

function downloadImage(imageUrl) {
    const url = ensureHttpsUrl(imageUrl);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relaytalk-${Date.now()}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
    showToast('Download started', '📥', 1500);
}

async function shareImage(imageUrl) {
    try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const file = new File([blob], 'relaytalk-image.jpg', { type: blob.type });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Image from RelayTalk' });
            return;
        }
    } catch (e) {}
    if (navigator.share) {
        try {
            await navigator.share({ title: 'Image', url: imageUrl });
        } catch (e) {
            if (e.name !== 'AbortError') copyToClipboard(imageUrl);
        }
    } else {
        copyToClipboard(imageUrl);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => showToast('URL copied!', '📋', 1500))
        .catch(() => showToast('Cannot copy', '⚠️', 1500));
}

console.log('✅ Image handler ready');