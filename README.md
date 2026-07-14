# Payroll Pro Version 1.5.2

Payroll Pro is a browser based payroll tracker with no prefilled employee or payroll data.

Included

- Generic Payroll Pro branding and avatar
- Payroll entry with Federal Tax, Medicare, Social Security, 401(K), Insurance, and Other deductions
- Automatic net payment calculation
- Dashboard, reports, analytics, calendar, notifications, backups, and PDF vault
- PDF pay stub text extraction
- OCR fallback for scanned PDFs
- Review and edit screen before saving imported payroll data
- Generic field detection with common payroll label variations
- Duplicate pay stub detection
- Bulk import entry point for unprocessed PDFs
- YTD gross and net reconciliation
- Import source and confidence tracking
- Installable PWA and offline app shell

PDF import

1. Upload one or more pay stub PDFs to PDF Vault.
2. Select Import Payroll Data.
3. Payroll Pro first checks embedded PDF text.
4. If the PDF is scanned, Payroll Pro uses OCR.
5. Review every detected field.
6. Save the confirmed paycheck.

Important

PDF formats vary by employer. Detection is designed for common labels, but the review screen is required because OCR and document layouts can produce errors. PDF and OCR libraries load from a CDN during extraction, so an internet connection is required for the first PDF import. Payroll data and PDF files remain in the browser storage on the device.

GitHub Pages

Upload the full folder to a GitHub repository, enable GitHub Pages from the main branch root, and open the published URL. Use Ctrl + Shift + R after replacing an older version.


## Version 1.5.2 fix

- Fixed invalid regular-expression escaping in PDF payroll extraction.
- Corrected detection for 401(K), dates, taxes, deductions, gross pay, and net pay.
- Updated the service-worker cache so browsers load the corrected extractor.
