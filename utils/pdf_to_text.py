#!/usr/bin/env python3
"""
Convert PDF to Text
Extracts text from Nigeria-Tax-Act-2025.pdf and saves it as a text file
"""

import sys
import os

try:
    import PyPDF2
except ImportError:
    print("Installing PyPDF2...")
    os.system("pip3 install PyPDF2 --quiet")
    import PyPDF2

def extract_text_from_pdf(pdf_path, output_path):
    """Extract text from PDF and save to text file"""
    try:
        with open(pdf_path, 'rb') as pdf_file:
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            total_pages = len(pdf_reader.pages)
            
            print(f"Found {total_pages} pages in PDF")
            print("Extracting text...")
            
            text_content = []
            for page_num, page in enumerate(pdf_reader.pages, 1):
                try:
                    text = page.extract_text()
                    text_content.append(f"\n\n=== PAGE {page_num} ===\n\n")
                    text_content.append(text)
                    if page_num % 50 == 0:
                        print(f"Processed {page_num}/{total_pages} pages...")
                except Exception as e:
                    print(f"Error extracting page {page_num}: {e}")
                    continue
            
            # Write to text file
            with open(output_path, 'w', encoding='utf-8') as output_file:
                output_file.write(''.join(text_content))
            
            print(f"\n✅ Successfully extracted text to: {output_path}")
            print(f"Total pages processed: {total_pages}")
            return True
            
    except FileNotFoundError:
        print(f"❌ Error: PDF file not found at {pdf_path}")
        return False
    except Exception as e:
        print(f"❌ Error extracting PDF: {e}")
        return False

if __name__ == "__main__":
    # Get the directory of this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    pdf_path = os.path.join(project_root, "Nigeria-Tax-Act-2025.pdf")
    output_path = os.path.join(project_root, "docs", "Nigeria-Tax-Act-2025.txt")
    
    # Create docs directory if it doesn't exist
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    if extract_text_from_pdf(pdf_path, output_path):
        print(f"\n📄 Text file saved to: {output_path}")
        print("You can now use this file for reference in the tax engine.")
    else:
        sys.exit(1)

