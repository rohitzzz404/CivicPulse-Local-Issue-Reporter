
import os
from datetime import datetime, timezone

import mysql.connector
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

VALID_CATEGORIES = {
    "Roads",
    "Sanitation",
    "Water",
    "Electricity",
    "Other",
}

VALID_SEVERITIES = {"Low", "Medium", "High", "Critical"}
VALID_STATUSES = {"Reported", "In Progress", "Resolved"}

DEPARTMENTS = {
    "Roads": "Road Maintenance",
    "Sanitation": "Sanitation",
    "Water": "Water Supply",
    "Electricity": "Electrical Maintenance",
    "Other": "General Services",
}


def get_db():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        user=os.getenv("DB_USER", "civicuser"),
        password=os.getenv("DB_PASSWORD", "civicpass"),
        database=os.getenv("DB_NAME", "civicpulse"),
        port=int(os.getenv("DB_PORT", "3306")),
    )


def priority_score(severity, age_hours, impact):
    """Illustrative priority score from 0 to 100."""
    severity_points = {
        "Low": 10,
        "Medium": 20,
        "High": 30,
        "Critical": 40,
    }

    severity_value = severity_points.get(severity, 10)
    impact_value = max(1, min(int(impact or 1), 5)) * 6
    age_value = min(max(age_hours, 0), 72) / 72 * 30

    return round(
        min(100, severity_value + impact_value + age_value),
        1,
    )


def serialize_report(report):
    created = report.get("created_at")

    if created:
        if created.tzinfo is not None:
            now = datetime.now(timezone.utc)
            age_hours = max(
                0,
                (now - created.astimezone(timezone.utc)).total_seconds()
                / 3600,
            )
        else:
            age_hours = max(
                0,
                (
                    datetime.now() - created
                ).total_seconds() / 3600,
            )
    else:
        age_hours = 0

    impact = int(report.get("impact") or 3)
    status = report.get("status", "Reported")

    # Resolved reports retain their score for historical display.
    report["age_hours"] = round(age_hours, 1)
    report["impact"] = impact
    report["priority_score"] = priority_score(
        report.get("severity", "Low"),
        age_hours,
        impact,
    )
    report["is_overdue"] = (
        status != "Resolved" and age_hours >= 48
    )

    for field in ("created_at", "updated_at"):
        value = report.get(field)
        if value:
            report[field] = value.isoformat(sep=" ")

    return report


@app.get("/api/health")
def health():
    conn = None

    try:
        conn = get_db()
        conn.ping(reconnect=True, attempts=1, delay=0)
        return jsonify({
            "status": "ok",
            "database": "connected",
        })
    except mysql.connector.Error:
        app.logger.exception("Database health check failed")
        return jsonify({
            "status": "error",
            "message": "Database connection failed.",
        }), 503
    finally:
        if conn and conn.is_connected():
            conn.close()


@app.get("/api/reports")
def get_reports():
    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                id,
                title,
                category,
                area,
                severity,
                status,
                impact,
                created_at,
                updated_at,
                latitude,
                longitude,
                department,
                description
            FROM reports
            ORDER BY created_at DESC
        """)

        reports = [
            serialize_report(report)
            for report in cursor.fetchall()
        ]

        reports.sort(
            key=lambda report: report["priority_score"],
            reverse=True,
        )

        return jsonify(reports)

    except mysql.connector.Error:
        app.logger.exception("Could not retrieve reports")
        return jsonify({
            "error": "Could not retrieve reports."
        }), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.post("/api/reports")
def create_report():
    data = request.get_json(silent=True) or {}

    title = str(data.get("title", "")).strip()
    category = str(data.get("category", "")).strip()
    area = str(data.get("area", "")).strip()
    severity = str(data.get("severity", "Medium")).strip()
    description = str(data.get("description", "")).strip()
    impact = data.get("impact", 3)

    if not title or not area:
        return jsonify({
            "error": "Title and location are required."
        }), 400

    if len(title) > 180 or len(area) > 180:
        return jsonify({
            "error": "Title and location must be 180 characters or fewer."
        }), 400

    if category not in VALID_CATEGORIES:
        return jsonify({"error": "Invalid category."}), 400

    if severity not in VALID_SEVERITIES:
        return jsonify({"error": "Invalid severity."}), 400

    try:
        impact = int(impact)
        if not 1 <= impact <= 5:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({
            "error": "Impact must be between 1 and 5."
        }), 400

    latitude = data.get("latitude")
    longitude = data.get("longitude")

    try:
        if latitude is not None:
            latitude = float(latitude)
            if not -90 <= latitude <= 90:
                raise ValueError

        if longitude is not None:
            longitude = float(longitude)
            if not -180 <= longitude <= 180:
                raise ValueError
    except (TypeError, ValueError):
        return jsonify({
            "error": "Invalid map coordinates."
        }), 400

    department = DEPARTMENTS[category]

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO reports (
                title,
                category,
                area,
                severity,
                status,
                impact,
                latitude,
                longitude,
                department,
                description
            )
            VALUES (%s, %s, %s, %s, 'Reported', %s, %s, %s, %s, %s)
        """, (
            title,
            category,
            area,
            severity,
            impact,
            latitude,
            longitude,
            department,
            description or None,
        ))

        conn.commit()
        report_id = cursor.lastrowid

        return jsonify({
            "id": report_id,
            "message": "Report created.",
        }), 201

    except mysql.connector.Error:
        if conn:
            conn.rollback()
        app.logger.exception("Could not create report")
        return jsonify({
            "error": "Could not save the report."
        }), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.patch("/api/reports/<int:report_id>/status")
def update_status(report_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")

    if status not in VALID_STATUSES:
        return jsonify({
            "error": "Invalid report status."
        }), 400

    conn = None
    cursor = None

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute(
            "UPDATE reports SET status = %s WHERE id = %s",
            (status, report_id),
        )

        if cursor.rowcount == 0:
            cursor.execute(
                "SELECT id FROM reports WHERE id = %s",
                (report_id,),
            )

            if cursor.fetchone() is None:
                return jsonify({
                    "error": "Report not found."
                }), 404

        conn.commit()

        return jsonify({
            "message": "Status updated.",
            "status": status,
        })

    except mysql.connector.Error:
        if conn:
            conn.rollback()
        app.logger.exception("Could not update report status")
        return jsonify({
            "error": "Could not update report status."
        }), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
