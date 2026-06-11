import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

duplicate_block = """
    const rawExtractionModal = document.getElementById('raw-extraction-modal');
    const closeRawExtractionBtn = document.getElementById('close-raw-extraction-btn');
    const rawExtractionCopyBtn = document.getElementById('raw-extraction-copy-btn');
    const rawExtractionDoneBtn = document.getElementById('raw-extraction-done-btn');
    const rawExtractionContent = document.getElementById('raw-extraction-content');
    const forceOcrCheckbox = document.getElementById('force-ocr-checkbox');
    
    if (closeRawExtractionBtn) closeRawExtractionBtn.addEventListener('click', () => rawExtractionModal.classList.remove('active'));
    if (rawExtractionDoneBtn) rawExtractionDoneBtn.addEventListener('click', () => rawExtractionModal.classList.remove('active'));
    if (rawExtractionCopyBtn) rawExtractionCopyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(rawExtractionContent.textContent);
        showToast("Raw JSON copied to clipboard!", "success");
    });"""

js = js.replace(duplicate_block, "")

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js)
