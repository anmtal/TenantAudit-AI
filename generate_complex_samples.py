import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def create_complex_lease_pdf(filename):
    doc = SimpleDocTemplate(filename, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#0f172a'),
        alignment=1, # Center
        spaceAfter=20
    )
    
    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#475569'),
        alignment=1,
        spaceAfter=40
    )
    
    sec_style = ParagraphStyle(
        'SecTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )
    
    subsec_style = ParagraphStyle(
        'SubSecTitle',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#1e293b'),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        spaceAfter=8
    )
    
    header_style = ParagraphStyle(
        'TableHeader',
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.white,
        alignment=0
    )
    
    cell_style = ParagraphStyle(
        'TableCell',
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#334155')
    )

    story = []
    
    # PAGE 1: COVER PAGE
    story.append(Spacer(1, 100))
    story.append(Paragraph("DEED OF LEASE", title_style))
    story.append(Paragraph("BY AND BETWEEN", subtitle_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>METROPOLIS TOWER PARTNERS LP</b><br/>(Landlord)", subtitle_style))
    story.append(Paragraph("AND", subtitle_style))
    story.append(Paragraph("<b>APEX COWORKING SOLUTIONS INTERNATIONAL INC.</b><br/>(Tenant)", subtitle_style))
    story.append(Spacer(1, 50))
    story.append(Paragraph("<b>Dated as of: October 12, 2020</b>", subtitle_style))
    story.append(Paragraph("Property Address: 777 Financial Way, Charlotte, North Carolina 28202<br/>Floor/Suite: 42nd Floor, Suite 4200", subtitle_style))
    story.append(PageBreak())
    
    # PAGE 2: PREAMBLE & PREMISES
    story.append(Paragraph("OFFICE LEASE AGREEMENT", title_style))
    story.append(Paragraph("THIS OFFICE LEASE AGREEMENT (this \"Lease\") is entered into as of the 12th day of October, 2020, by and between <b>METROPOLIS TOWER PARTNERS LP</b>, a Delaware limited partnership (\"Landlord\"), and <b>APEX COWORKING SOLUTIONS INTERNATIONAL INC.</b>, a Delaware corporation (\"Tenant\").", body_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("ARTICLE I: BASIC LEASE PROVISIONS & DEFINTIONS", sec_style))
    story.append(Paragraph("<b>Section 1.1: Premises.</b> Landlord hereby leases to Tenant, and Tenant hereby leases from Landlord, that certain commercial space commonly referred to as Suite 4200, located on the forty-second (42nd) floor of the office tower located at 777 Financial Way, Charlotte, North Carolina 28202 (the \"Building\"). The rentable area of the Premises is agreed by Landlord and Tenant to be exactly <b>14,500 rentable square feet</b> (the \"Premises\").", body_style))
    
    story.append(Paragraph("<b>Section 1.2: Term.</b> The lease term (the \"Term\") shall be for a duration of one hundred and twenty (120) full calendar months, commencing on September 1, 2021 (the \"Commencement Date\"), and expiring on the last day of the one-hundred and twentieth (120th) month, which is <b>August 31, 2031</b> (the \"Expiration Date\"), unless extended or sooner terminated under the provisions of this Lease.", body_style))
    
    story.append(Paragraph("<b>Section 1.3: Guarantor.</b> Tenant's performance of all duties and payment of all rents under this Lease is secured by a corporate guarantee executed by <b>APEX GLOBAL ENTERPRISES HOLDINGS LLC</b>, a Delaware limited liability company (\"Guarantor\"), under a separate parent guarantee agreement.", body_style))
    
    story.append(PageBreak())
    
    # PAGE 3: RENT SCHEDULE
    story.append(Paragraph("ARTICLE II: RENT, ESCALATIONS & SECURITY DEPOSIT", sec_style))
    story.append(Paragraph("<b>Section 2.1: Monthly Base Rent.</b> Tenant agrees to pay base rent to Landlord in monthly installments, in advance, on or before the first day of each calendar month. The monthly rent schedule shall escalate at 3.50% per annum, as set forth in the schedule below:", body_style))
    story.append(Spacer(1, 5))
    
    # Base Rent Table
    table_data = [
        [Paragraph("Lease Month Segment", header_style), Paragraph("Monthly Base Rent Rate", header_style), Paragraph("Annualized Base Rent", header_style)],
        [Paragraph("Months 1 - 12 (Year 1)", cell_style), Paragraph("$35,000.00", cell_style), Paragraph("$420,000.00", cell_style)],
        [Paragraph("Months 13 - 24 (Year 2)", cell_style), Paragraph("$36,225.00", cell_style), Paragraph("$434,700.00", cell_style)],
        [Paragraph("Months 25 - 36 (Year 3)", cell_style), Paragraph("$37,492.88", cell_style), Paragraph("$449,914.56", cell_style)],
        [Paragraph("Months 37 - 48 (Year 4)", cell_style), Paragraph("$38,805.13", cell_style), Paragraph("$465,661.56", cell_style)],
        [Paragraph("Months 49 - 60 (Year 5)", cell_style), Paragraph("$40,163.31", cell_style), Paragraph("$481,959.72", cell_style)],
        [Paragraph("Months 61 - 72 (Year 6)", cell_style), Paragraph("$41,569.02", cell_style), Paragraph("$498,828.24", cell_style)],
        [Paragraph("Months 73 - 84 (Year 7)", cell_style), Paragraph("$43,023.94", cell_style), Paragraph("$516,287.28", cell_style)],
        [Paragraph("Months 85 - 96 (Year 8)", cell_style), Paragraph("$44,529.78", cell_style), Paragraph("$534,357.36", cell_style)],
        [Paragraph("Months 97 - 108 (Year 9)", cell_style), Paragraph("$46,088.32", cell_style), Paragraph("$553,059.84", cell_style)],
        [Paragraph("Months 109 - 120 (Year 10)", cell_style), Paragraph("$47,701.41", cell_style), Paragraph("$572,416.92", cell_style)]
    ]
    
    rent_table = Table(table_data, colWidths=[150, 150, 150])
    rent_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e293b')),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('TOPPADDING', (0,0), (-1,0), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('TOPPADDING', (0,1), (-1,-1), 4),
        ('BOTTOMPADDING', (0,1), (-1,-1), 4),
    ]))
    
    story.append(rent_table)
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("<b>Section 2.2: Prepaid Rent.</b> Tenant shall pay the sum of <b>$35,000.00</b> upon execution of this Lease as prepaid rent, to be applied solely to the installment of Base Rent due for the first full calendar month of the Lease term.", body_style))
    
    story.append(Paragraph("<b>Section 2.3: Security Deposit.</b> Tenant, concurrently with the execution of this Lease, shall deposit with Landlord the sum of <b>$105,000.00</b> (representing three (3) months of the initial Base Rent) as security for the full and faithful performance of Tenant's covenants and obligations under this Lease. If Tenant defaults in any respect, Landlord may apply all or part of the Security Deposit to cure the default.", body_style))
    
    story.append(PageBreak())
    
    # PAGE 4: OPERATING EXPENSES & OPTIONS
    story.append(Paragraph("ARTICLE III: EXPENSES, MAINTENANCE & EXTENSIONS", sec_style))
    story.append(Paragraph("<b>Section 3.1: Operating Expenses (CAM).</b> In addition to monthly Base Rent, Tenant shall pay its pro-rata share of operating costs and Common Area Maintenance (CAM) expenses incurred by Landlord. Tenant's pro-rata share is agreed to be exactly <b>4.85%</b> of the Building's total operating expenses. Tenant's CAM pro-rata share contribution increases shall be capped at <b>3% annually</b>, calculated on a cumulative and compounding basis.", body_style))
    
    story.append(Paragraph("<b>Section 3.2: Renewal Options.</b> Tenant is hereby granted <b>two (2) renewal options</b>, each to extend the term of this Lease for an additional consecutive period of five (5) years. To exercise each option, Tenant must provide Landlord with formal, irrevocable written notice of intent to extend at least <b>270 days</b> prior to the then-current Expiration Date. Base rent during renewal terms shall be at Fair Market Value, determined in accordance with Exhibit D.", body_style))
    
    story.append(Paragraph("<b>Section 3.3: Landlord Repairs.</b> Landlord shall, at its sole cost and expense, maintain in good repair and condition the structural parts of the Building, mechanical elevator units, and Building electrical grids, except if repairs are required due to Tenant negligence.", body_style))
    
    story.append(Spacer(1, 30))
    story.append(Paragraph("IN WITNESS WHEREOF, the parties hereto have executed this Office Lease Agreement.", body_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("<b>LANDLORD:</b> Metropolis Tower Partners LP<br/>"
                           "By: Metropolis Tower GP LLC, its general partner<br/>"
                           "By: _______________________<br/>"
                           "Name: Arthur Vance, Managing Director", body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>TENANT:</b> Apex Coworking Solutions International Inc.<br/>"
                           "By: _______________________<br/>"
                           "Name: Clara Sterling, Chief Executive Officer", body_style))
    
    doc.build(story)

def create_complex_estoppel_pdf(filename):
    doc = SimpleDocTemplate(filename, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0f172a'),
        alignment=1, # Center
        spaceAfter=15
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155'),
        spaceAfter=8
    )

    story = []
    
    # Title & Metadata
    story.append(Paragraph("TENANT ESTOPPEL CERTIFICATE", title_style))
    story.append(Paragraph("<b>TO:</b> ACQUISITIONS & CAPITAL MARKETS TRUST INC. (\"Lender\") and its Successors and Assigns.<br/>"
                           "<b>RE:</b> Commercial Lease for Suite 4200, 777 Financial Way, Charlotte, NC 28202<br/>"
                           "<b>TENANT:</b> Apex Coworking Solutions Int'l, Inc. (\"Tenant\")", body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("The undersigned Tenant hereby certifies the following statement of facts to Landlord and Lender as of the date of execution below, acknowledging that Landlord and Lender are relying on these certifications in connection with financing transactions related to the Building:", body_style))
    story.append(Spacer(1, 5))
    
    # Statements with intentional discrepancies
    statements = [
        "1. The undersigned Tenant is the sole occupant of Suite 4200 comprising approximately <b>14,200 SF</b> of rentable square footage of office space in the Building.",
        "2. The Lease is in full force and effect. However, Landlord is currently in default under its repair obligations for failing to complete the elevator modernization repairs on the 42nd floor, which impairs tenant access.",
        "3. The lease term ends on <b>September 30, 2031</b>.",
        "4. The current monthly base rent payable by Tenant is <b>$41,569.02 per month</b>.",
        "5. The security deposit currently held by Landlord under the Lease is <b>$70,000.00</b>, and no portion has been applied.",
        "6. Tenant's pro-rata share of operating costs and Common Area Maintenance (CAM) expenses is <b>4.85%</b>. Increases are subject to an operating expense cap of <b>4% annually</b>.",
        "7. Tenant holds <b>one (1) renewal option</b> to extend the Lease term for 5 years.",
        "8. No base rent has been prepaid in advance, except for the current month's rent. Tenant has not paid any security deposits in the form of letters of credit, except as referenced herein.",
        "9. The lease obligations of Tenant are fully guaranteed by <b>Apex Global Enterprises Holdings LLC</b>."
    ]
    
    for s in statements:
        story.append(Paragraph(s, body_style))
        story.append(Spacer(1, 6))
        
    story.append(Spacer(1, 20))
    story.append(Paragraph("IN WITNESS WHEREOF, the Tenant has executed this Estoppel Certificate this 20th day of May, 2026.", body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>TENANT:</b> Apex Coworking Solutions Int'l, Inc.<br/>"
                           "By: _______________________<br/>"
                           "Name: Clara Sterling<br/>"
                           "Title: Chief Executive Officer", body_style))
    
    doc.build(story)

if __name__ == '__main__':
    create_complex_lease_pdf('complex_lease_agreement.pdf')
    create_complex_estoppel_pdf('complex_estoppel_certificate.pdf')
    print("Complex Lease and Estoppel PDFs generated successfully!")
