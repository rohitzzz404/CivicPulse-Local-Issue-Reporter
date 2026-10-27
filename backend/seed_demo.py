
import os
from datetime import datetime, timedelta

import mysql.connector


# All reports below are fictional demonstration records.
# Coordinates are illustrative, not verified incident locations.
DEMO_REPORTS = [
    ("DEMO-01", "Deep pothole near bus stop", "Roads", "Sector 12", "Critical", "Reported", 5, 19.0760, 72.8777, 3),
    ("DEMO-02", "Garbage collection delayed", "Sanitation", "Vashi Sector 17", "High", "In Progress", 4, 19.0770, 72.9980, 2),
    ("DEMO-03", "Water leaking from pipeline", "Water", "Nerul East", "Critical", "Reported", 5, 19.0330, 73.0190, 4),
    ("DEMO-04", "Streetlight outage near crossing", "Electricity", "Belapur Sector 11", "Medium", "Reported", 3, 19.0180, 73.0390, 1),
    ("DEMO-05", "Broken footpath tiles", "Roads", "Juinagar Station Road", "Low", "Resolved", 2, 19.0510, 73.0170, 7),
    ("DEMO-06", "Overflowing public waste bin", "Sanitation", "Koparkhairane Market", "High", "Reported", 4, 19.1020, 73.0060, 3),
    ("DEMO-07", "Low water pressure in residential lane", "Water", "Sanpada", "Medium", "In Progress", 3, 19.0630, 73.0120, 5),
    ("DEMO-08", "Damaged road surface after rain", "Roads", "Ghansoli", "High", "Reported", 4, 19.1160, 73.0000, 2),
    ("DEMO-09", "Streetlight flickering at night", "Electricity", "Airoli Sector 8", "Low", "Resolved", 2, 19.1580, 72.9980, 9),
    ("DEMO-10", "Blocked storm drain", "Sanitation", "CBD Belapur", "Critical", "In Progress", 5, 19.0190, 73.0400, 4),
    ("DEMO-11", "Water supply interruption", "Water", "Vashi Sector 9", "High", "Reported", 4, 19.0740, 72.9990, 6),
    ("DEMO-12", "Loose manhole cover", "Roads", "Nerul West", "Critical", "Reported", 5, 19.0310, 73.0150, 1),
    ("DEMO-13", "Garbage scattered beside market", "Sanitation", "Turbhe Market", "Medium", "In Progress", 3, 19.0760, 73.0170, 3),
    ("DEMO-14", "Damaged electric streetlight pole", "Electricity", "Kharghar Sector 7", "High", "Reported", 4, 19.0480, 73.0690, 2),
    ("DEMO-15", "Leaking public water tap", "Water", "Koparkhairane Sector 4", "Medium", "Resolved", 2, 19.1030, 73.0080, 8),
    ("DEMO-16", "Pothole causing traffic slowdown", "Roads", "Palm Beach Road", "High", "In Progress", 5, 19.0570, 73.0190, 3),
    ("DEMO-17", "Missed waste collection", "Sanitation", "Airoli Sector 5", "Medium", "Reported", 3, 19.1570, 72.9970, 1),
    ("DEMO-18", "Waterlogging near pedestrian crossing", "Other", "Sanpada Station", "High", "Reported", 4, 19.0620, 73.0110, 2),
    ("DEMO-19", "Footpath obstruction and broken paving", "Roads", "Vashi Sector 14", "Low", "In Progress", 2, 19.0800, 72.9950, 5),
    ("DEMO-20", "Public light not switching on", "Electricity", "Nerul Sector 21", "Medium", "Resolved", 2, 19.0410, 73.0190, 6),
    ("DEMO-21", "Drain cover damaged", "Sanitation", "Kharghar Sector 12", "High", "Reported", 4, 19.0440, 73.0750, 3),
    ("DEMO-22", "Water pipe seepage near building", "Water", "Ghansoli Sector 6", "High", "In Progress", 4, 19.1150, 73.0020, 4),
    ("DEMO-23", "Uneven road surface near school", "Roads", "CBD Belapur Sector 15", "Medium", "Reported", 3, 19.0220, 73.0410, 2),
    ("DEMO-24", "Overflowing community bins", "Sanitation", "Juinagar", "High", "Resolved", 4, 19.0510, 73.0180, 10),
    ("DEMO-25", "Broken streetlight near park", "Electricity", "Koparkhairane Sector 14", "Low", "Reported", 2, 19.1070, 73.0100, 1),
    ("DEMO-26", "Roadside drain blocked with debris", "Sanitation", "Turbhe", "Critical", "Reported", 5, 19.0740, 73.0180, 4),
    ("DEMO-27", "Intermittent water supply", "Water", "Airoli Sector 19", "Medium", "In Progress", 3, 19.1630, 72.9990, 7),
    ("DEMO-28", "Damaged speed-breaker markings", "Roads", "Sanpada Sector 10", "Low", "Resolved", 2, 19.0600, 73.0140, 12),
    ("DEMO-29", "Electrical light outage near walkway", "Electricity", "Kharghar Station", "High", "Reported", 4, 19.0470, 73.0690, 2),
    ("DEMO-30", "Public tap leaking continuously", "Water", "Vashi Sector 6", "Medium", "In Progress", 3, 19.0710, 72.9970, 5),
]

DEPARTMENTS = {
    "Roads": "Road Maintenance",
    "Sanitation": "Sanitation",
    "Water": "Water Supply",
    "Electricity": "Electrical Maintenance",
    "Other": "General Services",
}


def main():
    conn = mysql.connector.connect(
        host=os.getenv("DB_HOST", "db"),
        user=os.getenv("DB_USER", "civicuser"),
        password=os.getenv("DB_PASSWORD", "civicpass_local"),
        database=os.getenv("DB_NAME", "civicpulse"),
        port=int(os.getenv("DB_PORT", "3306")),
    )

    inserted = 0
    skipped = 0

    try:
        cursor = conn.cursor()

        for record in DEMO_REPORTS:
            (
                demo_key, title, category, area, severity, status,
                impact, latitude, longitude, days_ago
            ) = record

            # A recognizable prefix lets us find seeded records again.
            demo_title = f"[{demo_key}] {title}"

            cursor.execute(
                "SELECT id FROM reports WHERE title = %s AND area = %s",
                (demo_title, area),
            )

            if cursor.fetchone():
                skipped += 1
                continue

            created_at = datetime.now() - timedelta(days=days_ago)

            description = (
                "Fictional demonstration record for the CivicPulse project. "
                "This is not a verified real-world complaint."
            )

            cursor.execute(
                """
                INSERT INTO reports (
                    title, category, area, severity, status, impact,
                    latitude, longitude, department, description, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    demo_title, category, area, severity, status, impact,
                    latitude, longitude, DEPARTMENTS[category],
                    description, created_at,
                ),
            )
            inserted += 1

        conn.commit()
        print(f"Demo seeding complete. Inserted: {inserted}; skipped: {skipped}.")

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
