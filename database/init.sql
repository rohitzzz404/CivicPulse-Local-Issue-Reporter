
CREATE DATABASE IF NOT EXISTS civicpulse;
USE civicpulse;

CREATE TABLE IF NOT EXISTS reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    category ENUM(
        'Roads', 'Sanitation', 'Water', 'Electricity', 'Other'
    ) NOT NULL,
    area VARCHAR(180) NOT NULL,
    severity ENUM('Low', 'Medium', 'High', 'Critical')
        NOT NULL DEFAULT 'Medium',
    status ENUM('Reported', 'In Progress', 'Resolved')
        NOT NULL DEFAULT 'Reported',
    impact TINYINT NOT NULL DEFAULT 3,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (impact BETWEEN 1 AND 5),
    INDEX idx_status (status),
    INDEX idx_category (category),
    INDEX idx_created_at (created_at)
);

INSERT INTO reports (title, category, area, severity, status, impact)
VALUES
('Large pothole near main junction', 'Roads', 'Sector 12', 'High', 'Reported', 4),
('Garbage bins overflowing', 'Sanitation', 'Market Road', 'High', 'In Progress', 4),
('Water leaking from pipeline', 'Water', 'Green Park', 'Critical', 'Reported', 5),
('Streetlight not working', 'Electricity', 'Lake View', 'Medium', 'Resolved', 2),
('Damaged footpath tiles', 'Roads', 'Station Road', 'Low', 'In Progress', 2);
