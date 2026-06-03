import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def create_lease_pdf(filename):
    doc = SimpleDocTemplate(filename, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#111827'),
        alignment=1, # Center
        spaceAfter=15
    )
    
    sec_style = ParagraphStyle(
        'SecTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1f2937'),
        spaceBefore=12,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#374151'),
        spaceAfter=8
    )

    story = []
    
    # Title
    story.append(Paragraph("COMMERCIAL LEASE AGREEMENT", title_style))
    story.append(Paragraph("THIS LEASE AGREEMENT (the \"Lease\") is entered into as of October 1, 2020, by and between <b>LANDLORD ACQUISITIONS LLC</b> (\"Landlord\") and <b>SUBWAY REAL ESTATE, LLC</b>, a Delaware limited liability company (\"Tenant\").", body_style))
    story.append(Spacer(1, 10))
    
    # Section 1: Premises
    story.append(Paragraph("SECTION 1. PREMISES", sec_style))
    story.append(Paragraph("Landlord hereby leases to Tenant, and Tenant hereby leases from Landlord, the premises located at 455 Main Street, Suite 104-B, comprising approximately <b>1,800 square feet</b> of retail space (the \"Premises\").", body_style))
    
    # Section 2: Term
    story.append(Paragraph("SECTION 2. LEASE TERM", sec_style))
    story.append(Paragraph("The Lease term shall commence on January 1, 2021 (the \"Commencement Date\"), and shall expire ten (10) years thereafter, on <b>December 31, 2030</b> (the \"Expiration Date\"), unless terminated earlier in accordance with the terms of this Lease.", body_style))
    
    # Section 3: Base Rent
    story.append(Paragraph("SECTION 3. BASE RENT", sec_style))
    story.append(Paragraph("Tenant covenants and agrees to pay to Landlord monthly base rent during the term of this Lease. The initial monthly base rent for the first year of the Lease term shall be <b>$4,500.00 per month</b>, payable in advance on or before the first day of each calendar month.", body_style))
    story.append(Paragraph("Tenant shall prepay the first full month's base rent of <b>$4,500.00</b> upon execution of this Lease.", body_style))
    
    # Section 4: Security Deposit
    story.append(Paragraph("SECTION 4. SECURITY DEPOSIT", sec_style))
    story.append(Paragraph("Tenant shall deposit with Landlord the sum of <b>$9,000.00</b> upon execution of this Lease as a security deposit for the faithful performance of all covenants and obligations of Tenant under this Lease.", body_style))
    
    # Section 5: Expenses
    story.append(Paragraph("SECTION 5. COMMON AREA MAINTENANCE (CAM)", sec_style))
    story.append(Paragraph("Tenant agrees to pay to Landlord its pro-rata share of Common Area Maintenance (CAM) expenses, which is estimated to be <b>12.5%</b> of Landlord's total operating costs. Landlord agrees that Tenant's pro-rata share of CAM expense increases shall be capped at <b>4% annually</b>.", body_style))
    
    # Section 6: Options
    story.append(Paragraph("SECTION 6. RENEWAL OPTIONS", sec_style))
    story.append(Paragraph("Tenant is hereby granted <b>one (1) renewal option</b> to extend the Lease term for an additional period of five (5) years. Tenant must exercise this option by giving written notice to Landlord at least <b>180 days</b> prior to the Expiration Date.", body_style))
    
    # Section 7: Guarantor
    story.append(Paragraph("SECTION 7. GUARANTEE", sec_style))
    story.append(Paragraph("The obligations of Tenant under this Lease shall be fully guaranteed by its parent company, <b>Subway IP Inc.</b> (\"Guarantor\") under a separate Guaranty Agreement of even date.", body_style))
    
    doc.build(story)

def create_estoppel_pdf(filename):
    doc = SimpleDocTemplate(filename, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#111827'),
        alignment=1, # Center
        spaceAfter=15
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#374151'),
        spaceAfter=8
    )

    story = []
    
    # Title
    story.append(Paragraph("TENANT ESTOPPEL CERTIFICATE", title_style))
    story.append(Paragraph("<b>TO:</b> LANDLORD ACQUISITIONS LLC & LENDER PARTNERS INC.<br/>"
                           "<b>RE:</b> Commercial Lease for Suite 104-B, 455 Main Street<br/>"
                           "<b>TENANT:</b> Subway Real Estate, LLC", body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("The undersigned Tenant hereby certifies the following statement of facts to Landlord and Lender in connection with the purchase of the Property:", body_style))
    story.append(Spacer(1, 5))
    
    statements = [
        "1. The undersigned Tenant is the sole occupant of Suite 104-B comprising approximately 1,800 SF of retail space.",
        "2. The Lease is in full force and effect. To Tenant's current knowledge, Landlord is in full compliance with its obligations under the Lease and there are no active Landlord defaults.",
        "3. The lease term ends on <b>January 31, 2031</b>.",
        "4. The current monthly base rent payable by Tenant is <b>$4,200.00 per month</b>.",
        "5. The security deposit held by Landlord under the Lease is <b>$9,000.00</b>.",
        "6. Tenant's pro-rata share of Common Area Maintenance (CAM) expenses is <b>12.5%</b>.",
        "7. Tenant holds <b>two (2) renewal options</b> to extend the Lease term for 5 years each.",
        "8. No base rent has been paid in advance, except for the current month's rent."
    ]
    
    for s in statements:
        story.append(Paragraph(s, body_style))
        story.append(Spacer(1, 4))
        
    story.append(Spacer(1, 20))
    story.append(Paragraph("EXECUTED this 15th day of May, 2026.", body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>TENANT:</b> Subway Real Estate, LLC<br/>"
                           "By: _______________________<br/>"
                           "Title: Vice President of Franchising", body_style))
    
    doc.build(story)

if __name__ == '__main__':
    create_lease_pdf('sample_subway_lease.pdf')
    create_estoppel_pdf('sample_subway_estoppel.pdf')
    print("Sample PDFs generated successfully!")
