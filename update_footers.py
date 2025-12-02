#!/usr/bin/env python3
import re

# List of files to update
files = [
    'faqs.html',
    'rapport.html',
    'sponsor.html',
    'wellness-intake.html',
    'workplace-wellness.html',
    'corporate.html',
    'approach.html',
    'admin.html'
]

# Old footer pattern (three-section footer)
old_footer_pattern = r'<footer class="footer">\s*<div class="footer-section">.*?</footer>'

# New footer (simple footer from index.html)
new_footer = '''<footer class="footer">
        <div class="footer-links">
            <a href="contact.html">Contact</a>
            <span class="footer-divider">|</span>
            <a href="privacy.html">Privacy Policy</a>
            <span class="footer-divider">|</span>
            <a href="terms.html">Terms of Service</a>
        </div>
    </footer>'''

# Process each file
for filename in files:
    filepath = f'/home/almamargaret/booking-website/{filename}'
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Replace the old footer with new footer
        updated_content = re.sub(old_footer_pattern, new_footer, content, flags=re.DOTALL)

        # Write back
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(updated_content)

        print(f'✓ Updated {filename}')
    except Exception as e:
        print(f'✗ Error updating {filename}: {e}')

print('\nFooter update complete!')
