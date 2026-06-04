import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

# --- Boilerplate Content Generator Helper ---
def get_article_content(title, num):
    boilerplates = {
        "1": (
            "Section 1.1: Demise. Landlord hereby leases to Tenant, and Tenant hereby hires and takes from Landlord, the Premises as defined herein, subject to all covenants, terms, and conditions of this Deed of Lease. Tenant accepts the Premises in its 'as-is' and 'where-is' condition without representation or warranty of suitability.<br/><br/>"
            "Section 1.2: Defined Premises Area. The commercial real estate Premises is designated as Suite 4200, situated on the forty-second (42nd) floor of the commercial high-rise tower located at 777 Financial Way, Charlotte, North Carolina 28202. The parties stipulate and agree for all purposes of this Lease that the rentable square footage of the Premises is exactly <b>14,500 rentable square feet</b>.<br/><br/>"
            "Section 1.3: Common Areas. Tenant shall have the non-exclusive right, in common with Landlord and other tenants of the Building, to use the common areas, including common corridors, elevators, public lobbies, and parking areas, subject to Building Rules and Regulations."
        ),
        "2": (
            "Section 2.1: Lease Term. The term of this Lease (the 'Term') shall begin on September 1, 2021 (the 'Commencement Date') and shall continue for one hundred and twenty (120) full calendar months, expiring on <b>August 31, 2031</b> (the 'Expiration Date'), unless terminated sooner in accordance with the terms herein.<br/><br/>"
            "Section 2.2: Delay in Possession. Landlord shall use reasonable efforts to deliver possession on the Commencement Date. If Landlord is delayed in delivering possession, Landlord shall not be liable for damages, and the Expiration Date shall remain unchanged except as otherwise negotiated under Section 2.4.<br/><br/>"
            "Section 2.3: Holding Over. If Tenant remains in possession after the Expiration Date without Landlord's written consent, Tenant shall pay rent at 150% of the last applicable Base Rent, and shall indemnify Landlord against all consequential damages."
        ),
        "3": (
            "Section 3.1: Base Rent Covenants. Tenant covenants and agrees to pay to Landlord monthly base rent ('Base Rent') in advance, on or before the first day of each calendar month. The base rent schedule shall escalate at 3.50% per annum, as set forth in the Schedule of Base Rent below:<br/><br/>"
            "Section 3.2: First Month's Prepayment. Tenant shall pay the sum of <b>$35,000.00</b> upon execution of this Lease as prepaid rent, to be applied solely to the first full month's Base Rent installment.<br/><br/>"
            "Section 3.3: Late Fees. If any Base Rent payment is not received within five (5) days of its due date, Tenant shall pay a late fee equal to five percent (5%) of the overdue amount."
        ),
        "4": (
            "Section 4.1: Security Deposit Payment. Concurrently with the execution of this Lease, Tenant shall deposit with Landlord the sum of <b>$105,000.00</b> (representing three months of Year 1 Base Rent) to be held as a security deposit for the performance of Tenant's obligations hereunder.<br/><br/>"
            "Section 4.2: Application of Funds. If Tenant defaults on any covenant or payment, Landlord may apply all or any part of the Security Deposit to remedy the default. Tenant shall immediately restore the Security Deposit to its full original amount upon Landlord's demand.<br/><br/>"
            "Section 4.3: Return of Deposit. The remaining balance of the Security Deposit shall be returned to Tenant within forty-five (45) days after the Expiration Date, provided Tenant has vacated the Premises and left them in good condition."
        ),
        "5": (
            "Section 5.1: Permitted Use. Tenant shall use the Premises solely for general professional office, business administration, and coworking operations, and for no other purpose without Landlord's prior written consent.<br/><br/>"
            "Section 5.2: Compliance with Laws. Tenant shall, at its sole cost, comply with all federal, state, and local laws, codes, and regulations, including the Americans with Disabilities Act (ADA) and local zoning ordinances, applicable to Tenant's use of the Premises.<br/><br/>"
            "Section 5.3: Waste and Nuisance. Tenant shall not commit waste, nor allow any nuisance, hazardous material discharge, or excessive noise or vibration to occur on or about the Premises."
        ),
        "6": (
            "Section 6.1: Landlord Utilities. Landlord shall provide Building standard HVAC services, elevator service, electricity, and janitorial services to the common areas during normal business hours.<br/><br/>"
            "Section 6.2: Excess Utility Usage. If Tenant requires electricity, water, or HVAC services in excess of Building standard levels, Tenant shall pay the cost of such excess service, including submetering installation and administration costs.<br/><br/>"
            "Section 6.3: Service Interruptions. Landlord shall not be liable for damages, nor shall rent be abated, due to any temporary interruption of utility services caused by repairs, maintenance, accidents, or force majeure events."
        ),
        "7": (
            "Section 7.1: Tenant Maintenance. Tenant shall, at its sole expense, maintain the interior of the Premises in clean, sanitary, and good order, including electrical fixtures, light bulbs, doors, and interior partitions.<br/><br/>"
            "Section 7.2: Structural Repairs. Landlord shall maintain in good repair and condition the structural parts of the Building, mechanical elevator units, and Building electrical grids, except if repairs are required due to Tenant negligence.<br/><br/>"
            "Section 7.3: HVAC System. Tenant shall be responsible for minor repairs and routine maintenance of the localized heating, ventilation, and air conditioning units servicing the Premises."
        ),
        "8": (
            "Section 8.1: Alterations Consent. Tenant shall make no structural alterations, additions, or improvements to the Premises without Landlord's prior written consent, which shall not be unreasonably withheld, conditioned, or delayed.<br/><br/>"
            "Section 8.2: Permitting and Insurance. Prior to commencing any construction, Tenant shall obtain all necessary permits and provide Landlord with certificates of builder's risk insurance and liability coverage.<br/><br/>"
            "Section 8.3: Removal of Improvements. All permanent improvements shall become the property of Landlord upon the Expiration Date, unless Landlord requests Tenant to remove them at Tenant's sole expense."
        ),
        "9": (
            "Section 9.1: CAM Contribution. In addition to Base Rent, Tenant shall pay its pro-rata share of operating costs and Common Area Maintenance (CAM) expenses. Tenant's pro-rata share is agreed to be exactly <b>4.85%</b> of the Building's total operating expenses.<br/><br/>"
            "Section 9.2: CAM Expense Cap. Landlord agrees that Tenant's pro-rata share contribution increases shall be capped at <b>3% annually</b>, calculated on a cumulative and compounding basis.<br/><br/>"
            "Section 9.3: Audit Rights. Tenant shall have the right, at its own expense and upon thirty (30) days' written notice, to audit Landlord's operating expense statements once per calendar year."
        ),
        "10": (
            "Section 10.1: Tenant Insurance. Tenant shall procure and maintain commercial general liability insurance with a limit of not less than $2,000,000 per occurrence. Landlord and Landlord's agent shall be named as additional insureds.<br/><br/>"
            "Section 10.2: Property Insurance. Landlord shall maintain property insurance covering the Building structure, and Tenant shall maintain insurance covering all personal property, trade fixtures, and inventory.<br/><br/>"
            "Section 10.3: Waiver of Subrogation. Landlord and Tenant hereby release each other from liability for any loss or damage covered by their respective insurance policies, waiving all rights of subrogation."
        ),
        "11": (
            "Section 11.1: Reconstruction obligations. If the Premises is damaged by fire or other casualty, Landlord shall restore the Building structure with reasonable promptness, unless Landlord elects to terminate the Lease under Section 11.2.<br/><br/>"
            "Section 11.2: Landlord's Termination Right. If damage exceeds fifty percent (50%) of the Building's replacement cost, Landlord may terminate this Lease by giving written notice within sixty (60) days of the casualty.<br/><br/>"
            "Section 11.3: Rent Abatement. Base Rent and operating expenses shall be abated proportionally to the extent that the Premises is rendered untenantable during the restoration period."
        ),
        "12": (
            "Section 12.1: Total Condemnation. If the entire Building or Premises is taken by right of eminent domain, this Lease shall terminate as of the date of taking, and all awards shall belong to Landlord.<br/><br/>"
            "Section 12.2: Partial Condemnation. If a material portion of the Premises is taken, Tenant may terminate this Lease, or remain in possession with a proportional reduction in Base Rent.<br/><br/>"
            "Section 12.3: Tenant Claim. Tenant may file a separate claim for moving expenses and trade fixtures, provided such claim does not reduce Landlord's award."
        ),
        "13": (
            "Section 13.1: Consent Required. Tenant shall not assign, sublet, mortgage, or otherwise transfer this Lease or any interest herein without Landlord's prior written consent, which shall not be unreasonably withheld.<br/><br/>"
            "Section 13.2: Corporate Transfers. The merger, consolidation, or transfer of a controlling interest in Tenant shall be deemed an assignment under this Article, requiring Landlord's consent.<br/><br/>"
            "Section 13.3: Excess Rent. If Tenant receives rent from a subtenant in excess of the Base Rent payable under this Lease, Tenant shall pay fifty percent (50%) of such excess to Landlord."
        ),
        "14": (
            "Section 14.1: Events of Default. The occurrence of any of the following shall constitute a default: (a) failure to pay rent within five days of notice; (b) failure to perform covenants within thirty days of notice; (c) bankruptcy or insolvency.<br/><br/>"
            "Section 14.2: Landlord Remedies. Upon default, Landlord may: (a) terminate the Lease and recover possession; (b) relet the Premises as Tenant's agent; (c) accelerate all remaining Base Rent installments.<br/><br/>"
            "Section 14.3: Right to Cure. If Tenant fails to perform any obligation, Landlord may perform it on Tenant's behalf, and Tenant shall pay the cost thereof as additional rent."
        ),
        "15": (
            "Section 15.1: Waiver of Subrogation. The parties hereby establish mutual waivers of subrogation rights as detailed under Article 10, ensuring that primary claims are resolved via insurer pools.<br/><br/>"
            "Section 15.2: Waiver of Jury Trial. LANDLORD AND TENANT EACH HEREBY IRREVOCABLY WAIVE ALL RIGHTS TO A TRIAL BY JURY IN ANY PROCEEDING ARISING OUT OF OR RELATED TO THIS LEASE."
        ),
        "16": (
            "Section 16.1: Subordination Covenants. This Lease is and shall be subordinate to all mortgages and deeds of trust now or hereafter placing a lien upon the Building, provided the mortgagee executes an SNDA agreement.<br/><br/>"
            "Section 16.2: Attornment. In the event of foreclosure, Tenant shall attorn to the purchaser, and this Lease shall continue in full force and effect as a direct lease between Tenant and the purchaser."
        ),
        "17": (
            "Section 17.1: Estoppel Certificate. Tenant shall, within ten (10) business days of Landlord's written request, execute and deliver a statement certifying: (a) that the Lease is unmodified; (b) key date alignments; (c) rent totals; (d) default status."
        ),
        "18": (
            "Section 18.1: Rules Compliance. Tenant shall comply with all Building Rules and Regulations attached as Exhibit C, which Landlord may modify from time to time for the safety, cleanliness, and order of the Building."
        ),
        "19": (
            "Section 19.1: Quiet Enjoyment. Landlord covenants that Tenant, upon paying rent and performing all covenants, shall peaceably and quietly hold and enjoy the Premises during the Term without disturbance."
        ),
        "20": (
            "Section 20.1: Environmental representations. Tenant shall not store, use, generate, or dispose of any Hazardous Material on the Premises, except for standard office cleaning supplies in compliant quantities."
        ),
        "21": (
            "Section 21.1: Right of Entry. Landlord and its agents shall have the right to enter the Premises at reasonable times, upon reasonable notice, to inspect, repair, maintain, or exhibit the Premises to prospective tenants."
        ),
        "22": (
            "Section 22.1: Liability Limits. Landlord's liability under this Lease shall be limited solely to Landlord's interest in the Building, and no partner, officer, director, or shareholder of Landlord shall have personal liability."
        ),
        "23": (
            "Section 23.1: Force Majeure. Neither party shall be liable for failure to perform obligations (except rent payments) if delayed by war, strike, acts of God, governmental restriction, or building materials shortages."
        ),
        "24": (
            "Section 24.1: Notices. All notices, demands, or requests shall be in writing and sent by certified mail or national overnight courier to the addresses set forth in the preamble, with copy to legal counsel."
        ),
        "25": (
            "Section 25.1: Brokerage Commissions. Landlord and Tenant represent that they have dealt with no brokers other than Landmark Realty Group, whose commission shall be paid solely by Landlord under separate agreement."
        ),
        "26": (
            "Section 26.1: Severability. If any provision of this Lease is held invalid or unenforceable, the remainder of the Lease shall not be affected, and each provision shall be valid and enforced to the fullest extent permitted by law."
        ),
        "27": (
            "Section 27.1: Entire Agreement. This Lease, including all Exhibits, constitutes the entire agreement between the parties, and supersedes all prior negotiations, representations, or understandings."
        ),
        "28": (
            "Section 28.1: Governing Law. This Lease shall be governed by, construed, and enforced in accordance with the laws of the State of North Carolina, without regard to conflicts of laws principles."
        ),
        "29": (
            "Section 29.1: Relocation of Premises. Landlord reserves the right, upon sixty (60) days' written notice, to relocate Tenant to other comparable space in the Building, paying all reasonable moving expenses."
        ),
        "30": (
            "Section 30.1: Renewal Option Terms. Tenant holds <b>two (2) renewal options</b>, each to extend the term of this Lease for an additional consecutive period of five (5) years. Notice must be provided at least <b>270 days</b> prior to expiration."
        )
    }
    
    default_boilerplate = (
        f"Section {num}.1: Administrative Provisions. The parties covenant that they will execute all auxiliary agreements necessary to enforce the rights described under this Article.<br/><br/>"
        f"Section {num}.2: Compliance Audits. From time to time, either party may request certificate verification of standard clauses to maintain transaction compliance in the commercial property space.<br/><br/>"
        f"Section {num}.3: Indemnification. Each party agrees to defend, indemnify, and hold harmless the other from any third-party claims arising from administrative failures or covenant default."
    )
    
    return boilerplates.get(str(num), default_boilerplate)

def create_massive_lease_pdf(filename):
    doc = SimpleDocTemplate(filename, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor('#0f172a'),
        alignment=1, # Center
        spaceAfter=20
    )
    
    subtitle_style = ParagraphStyle(
        'DocSub',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor('#475569'),
        alignment=1,
        spaceAfter=30
    )
    
    sec_style = ParagraphStyle(
        'SecTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=9,
        leading=12.5,
        textColor=colors.HexColor('#334155'),
        spaceAfter=8
    )
    
    header_style = ParagraphStyle(
        'TableHeader',
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=10,
        textColor=colors.white,
        alignment=0
    )
    
    cell_style = ParagraphStyle(
        'TableCell',
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#334155')
    )

    story = []
    
    # PAGE 1: TITLE PAGE
    story.append(Spacer(1, 150))
    story.append(Paragraph("DEED OF COMMERCIAL OFFICE LEASE", title_style))
    story.append(Paragraph("METROPOLIS TOWER PORTNERSHIP PROJECT", subtitle_style))
    story.append(Spacer(1, 20))
    story.append(Paragraph("<b>LANDLORD:</b> METROPOLIS TOWER PARTNERS LP<br/>(a Delaware limited partnership)", subtitle_style))
    story.append(Paragraph("<b>TENANT:</b> APEX COWORKING SOLUTIONS INTERNATIONAL INC.<br/>(a Delaware corporation)", subtitle_style))
    story.append(Spacer(1, 50))
    story.append(Paragraph("Premises: 777 Financial Way, Charlotte, NC 28202<br/>Floor/Suite: 42nd Floor, Suite 4200", subtitle_style))
    story.append(PageBreak())
    
    # PAGE 2: TABLE OF CONTENTS
    story.append(Paragraph("TABLE OF CONTENTS", title_style))
    story.append(Spacer(1, 10))
    
    toc_data = [
        ["Article 1: Premises & Demise", "Page 3", "Article 16: Subordination & SNDAs", "Page 18"],
        ["Article 2: Lease Term & Delay", "Page 4", "Article 17: Tenant Estoppels", "Page 19"],
        ["Article 3: Base Rent Schedule", "Page 5", "Article 18: Building Rules", "Page 20"],
        ["Article 4: Security Deposit", "Page 7", "Article 19: Quiet Enjoyment", "Page 21"],
        ["Article 5: Use of Premises", "Page 8", "Article 20: Environmental Covenants", "Page 22"],
        ["Article 6: Utilities & Services", "Page 9", "Article 21: Right of Entry", "Page 23"],
        ["Article 7: Maintenance & Repairs", "Page 10", "Article 22: Liability Limits", "Page 24"],
        ["Article 8: Alterations Consent", "Page 11", "Article 23: Force Majeure", "Page 25"],
        ["Article 9: CAM Expenses & Caps", "Page 12", "Article 24: Notices & Covenants", "Page 26"],
        ["Article 10: Tenant Insurance", "Page 13", "Article 25: Brokerage Fees", "Page 27"],
        ["Article 11: Fire & Casualty", "Page 14", "Article 26: Severability", "Page 28"],
        ["Article 12: Condemnation", "Page 15", "Article 27: Entire Agreement", "Page 29"],
        ["Article 13: Assignment Rules", "Page 16", "Article 28: Governing Law", "Page 30"],
        ["Article 14: Default & Remedies", "Page 17", "Article 29: Relocation Rights", "Page 31"],
        ["Article 15: Waivers & Jury Trial", "Page 17", "Article 30: Renewal Option Terms", "Page 32"],
        ["Exhibit A: Legal Description", "Page 33", "Exhibit B: Floor Plan Outline", "Page 34"],
        ["Exhibit C: Rules Schedule", "Page 35", "Exhibit D: Execution Witnesses", "Page 36"]
    ]
    
    toc_table = Table(toc_data, colWidths=[150, 60, 150, 60])
    toc_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
    ]))
    story.append(toc_table)
    story.append(PageBreak())
    
    # PAGES 3 to 32: ARTICLES (30 distinct pages/articles)
    articles_titles = [
        "Premises & Demise", "Lease Term & Delay", "Base Rent Schedule", "Security Deposit",
        "Use of Premises", "Utilities & Services", "Maintenance & Repairs", "Alterations Consent",
        "CAM Expenses & Caps", "Tenant Insurance", "Fire & Casualty", "Condemnation",
        "Assignment Rules", "Default & Remedies", "Waivers & Jury Trial", "Subordination & SNDAs",
        "Tenant Estoppels", "Building Rules", "Quiet Enjoyment", "Environmental Covenants",
        "Right of Entry", "Liability Limits", "Force Majeure", "Notices & Covenants",
        "Brokerage Fees", "Severability", "Entire Agreement", "Governing Law",
        "Relocation Rights", "Renewal Option Terms"
    ]
    
    for idx, title in enumerate(articles_titles):
        article_num = idx + 1
        story.append(Paragraph(f"ARTICLE {article_num}: {title.upper()}", sec_style))
        story.append(Spacer(1, 10))
        story.append(Paragraph(get_article_content(title, article_num), body_style))
        
        # In Article 3, append the base rent table
        if article_num == 3:
            story.append(Spacer(1, 10))
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
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
                ('TOPPADDING', (0,0), (-1,-1), 4),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ]))
            story.append(rent_table)
            
        story.append(PageBreak())
        
    # PAGES 33 to 36: EXHIBITS & EXECUTIONS (4 pages)
    # Page 33: Exhibit A
    story.append(Paragraph("EXHIBIT A: LEGAL DESCRIPTION OF LAND", sec_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("All that tract or parcel of land lying and being in the City of Charlotte, Mecklenburg County, State of North Carolina, and being more particularly described as follows: Lying at the intersection of the southern margin of Financial Way with the eastern margin of Trade Street, containing approximately 2.45 acres and designated as Tax Parcel Lot 901-44.", body_style))
    story.append(PageBreak())
    
    # Page 34: Exhibit B
    story.append(Paragraph("EXHIBIT B: FLOOR PLAN OUTLINE", sec_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("The floor plan outline of Suite 4200 (comprising approximately 14,500 rentable square feet) is designated in the Building architectural files as Sheet A-42. Tenant's layout includes 42 private offices, open coworking bays, elevator lobby access, and utility closets.", body_style))
    story.append(PageBreak())
    
    # Page 35: Exhibit C
    story.append(Paragraph("EXHIBIT C: RULES AND REGULATIONS", sec_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("1. Sidewalks, halls, passages, and exits shall not be obstructed by Tenant.<br/>2. Standard Building hours are 8:00 AM to 6:00 PM, Monday through Friday. HVAC requested outside of these hours will be subject to overtime rates.<br/>3. Loading dock deliveries must be scheduled at least 24 hours in advance.", body_style))
    story.append(PageBreak())
    
    # Page 36: Executions
    story.append(Spacer(1, 50))
    story.append(Paragraph("LEASE AGREEMENT EXECUTION SIGNATURE BLOCKS", sec_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("IN WITNESS WHEREOF, the parties hereto have executed this Office Lease Agreement as of the date first above written.", body_style))
    story.append(Spacer(1, 30))
    story.append(Paragraph("<b>LANDLORD:</b> Metropolis Tower Partners LP<br/>"
                           "By: Metropolis Tower GP LLC, its general partner<br/>"
                           "By: _______________________<br/>"
                           "Name: Arthur Vance, Managing Director", body_style))
    story.append(Spacer(1, 30))
    story.append(Paragraph("<b>TENANT:</b> Apex Coworking Solutions International Inc.<br/>"
                           "By: _______________________<br/>"
                           "Name: Clara Sterling, Chief Executive Officer", body_style))
    
    doc.build(story)

def create_massive_estoppel_pdf(filename):
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
    
    sec_style = ParagraphStyle(
        'SecTitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
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
    
    # PAGE 1: TITLE & PREAMBLE
    story.append(Paragraph("TENANT ESTOPPEL CERTIFICATE", title_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>TO:</b> ACQUISITIONS & CAPITAL MARKETS TRUST INC. (\"Lender\") and its Successors and Assigns.<br/>"
                           "<b>RE:</b> Commercial Lease for Suite 4200, 777 Financial Way, Charlotte, NC 28202<br/>"
                           "<b>TENANT:</b> Apex Coworking Solutions Int'l, Inc. (\"Tenant\")", body_style))
    story.append(Spacer(1, 20))
    story.append(Paragraph("The undersigned Tenant hereby certifies the following statement of facts to Landlord and Lender as of the date of execution below, acknowledging that Landlord, Lender, and their respective designees are relying on these certifications in connection with financing transactions and purchases of the Property:", body_style))
    story.append(PageBreak())
    
    # PAGE 2: MAIN REPRESENTATIONS & CERTIFICATIONS (1 to 5)
    story.append(Paragraph("ARTICLE I: REPRESENTATIONS OF LEASE STATUS", sec_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("1. Occupancy and Size: The undersigned Tenant is the sole occupant of Suite 4200. Tenant certifies that the square footage of the space is <b>14,200 SF</b> of rentable office space.", body_style))
    story.append(Paragraph("2. Lease Validity: The Lease is in full force and effect. However, Landlord is currently in default under its repair obligations for failing to complete the elevator modernization repairs on the 42nd floor, which impairs tenant access.", body_style))
    story.append(Paragraph("3. Lease Expiration: The lease term ends on <b>September 30, 2031</b>, subject to no options, except as stated herein.", body_style))
    story.append(Paragraph("4. Rent Totals: The current monthly base rent payable by Tenant is <b>$41,569.02 per month</b>.", body_style))
    story.append(Paragraph("5. Security Deposit: The security deposit currently held by Landlord under the Lease is <b>$70,000.00</b>.", body_style))
    story.append(PageBreak())
    
    # PAGE 3: CERTIFICATIONS CONTINUED (6 to 9)
    story.append(Paragraph("ARTICLE II: ADDITIONAL LEASE COVENANTS", sec_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("6. Operating Expenses: Tenant's pro-rata share of operating costs and Common Area Maintenance (CAM) expenses is <b>4.85%</b>. Increases are subject to an operating expense cap of <b>4% annually</b>.", body_style))
    story.append(Paragraph("7. Renewal Options: Tenant holds <b>one (1) renewal option</b> to extend the Lease term for 5 years.", body_style))
    story.append(Paragraph("8. Prepaid Rent: No base rent has been paid in advance, except for the current month's rent. Tenant has not paid any security deposits in the form of letters of credit, except as referenced herein.", body_style))
    story.append(Paragraph("9. Corporate Guarantee: The lease obligations of Tenant are fully guaranteed by <b>Apex Global Enterprises Holdings LLC</b>.", body_style))
    story.append(PageBreak())
    
    # PAGE 4: SCHEDULE OF LEASE AMENDMENTS & GUARANTIES
    story.append(Paragraph("EXHIBIT A: SCHEDULE OF AMENDMENTS", sec_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("Tenant certifies that the Lease is unmodified and in full force and effect, and represents the entire agreement between Landlord and Tenant regarding the Premises. There are no amendments, letters, or agreements (oral or written) modifying the terms, except as listed below:", body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("- Corporate Parent Guaranty Agreement dated October 12, 2020 by Apex Global Enterprises Holdings LLC.<br/>"
                           "- Commencement Date Letter dated September 1, 2021 confirming possession.", body_style))
    story.append(PageBreak())
    
    # PAGE 5: EXECUTIONS & NOTARIZATION
    story.append(Paragraph("ESTOPPEL CERTIFICATE EXECUTION", sec_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("IN WITNESS WHEREOF, the Tenant has executed this Estoppel Certificate this 20th day of May, 2026.", body_style))
    story.append(Spacer(1, 20))
    story.append(Paragraph("<b>TENANT:</b> Apex Coworking Solutions Int'l, Inc.<br/>"
                           "By: _______________________<br/>"
                           "Name: Clara Sterling<br/>"
                           "Title: Chief Executive Officer", body_style))
    story.append(Spacer(1, 30))
    story.append(Paragraph("STATE OF NORTH CAROLINA<br/>COUNTY OF MECKLENBURG", body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("On this 20th day of May, 2026, before me, a Notary Public, personally appeared Clara Sterling, known to me to be the person who executed the within instrument on behalf of the corporation, and acknowledged to me that she executed the same.", body_style))
    story.append(Spacer(1, 20))
    story.append(Paragraph("___________________________<br/>Notary Public for North Carolina<br/>My Commission Expires: 12/31/2028", body_style))
    
    doc.build(story)

if __name__ == '__main__':
    create_massive_lease_pdf('complex_lease_agreement.pdf')
    create_massive_estoppel_pdf('complex_estoppel_certificate.pdf')
    print("Massive Lease (36 pages) and Estoppel (5 pages) generated successfully!")
