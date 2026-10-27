
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const CENTER = [19.075, 73.015];

const CATEGORIES = ["Roads", "Sanitation", "Water", "Electricity", "Other"];
const STATUSES = ["Reported", "In Progress", "Resolved"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];

const CATEGORY_ICONS = {
  Roads: "⌁",
  Sanitation: "✳",
  Water: "≈",
  Electricity: "ϟ",
  Other: "•",
};

const SEVERITY_COLORS = {
  Low: "#4c9b79",
  Medium: "#d6a342",
  High: "#e17a43",
  Critical: "#d94e5b",
};

function formatAge(hours) {
  const value = Number(hours || 0);
  if (value < 1) return "Just now";
  if (value < 24) return `${Math.floor(value)}h ago`;
  const days = Math.floor(value / 24);
  return `${days}d ago`;
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : ""));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MapFocus({ report }) {
  const map = useMap();

  useEffect(() => {
    if (report?.latitude != null && report?.longitude != null) {
      map.flyTo(
        [Number(report.latitude), Number(report.longitude)],
        Math.max(map.getZoom(), 14),
        { duration: 0.6 }
      );
    }
  }, [report, map]);

  return null;
}

function LocationPickerEvents({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

function App() {
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [severity, setSeverity] = useState("All");
  const [activeView, setActiveView] = useState("Map");
  const [showForm, setShowForm] = useState(false);
  const [pickedLocation, setPickedLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  async function loadReports(showLoader = false) {
    if (showLoader) setLoading(true);

    try {
      const response = await fetch("/api/reports");
      if (!response.ok) throw new Error("Unable to load reports from the API.");

      const data = await response.json();

      const normalized = data.map((report) => ({
        ...report,
        dbId: report.id,
        displayId: `CP-${String(report.id).padStart(4, "0")}`,
        latitude:
          report.latitude == null ? null : Number(report.latitude),
        longitude:
          report.longitude == null ? null : Number(report.longitude),
      }));

      setReports(normalized);
      setError("");
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not connect to CivicPulse.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports(true);
  }, []);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reports.filter((report) => {
      const matchesSearch = [
        report.title,
        report.area,
        report.category,
        report.department || "",
        report.displayId,
        report.description || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

      return (
        matchesSearch &&
        (category === "All" || report.category === category) &&
        (status === "All" || report.status === status) &&
        (severity === "All" || report.severity === severity)
      );
    });
  }, [reports, search, category, status, severity]);

  const mappedReports = filteredReports.filter(
    (report) =>
      Number.isFinite(report.latitude) &&
      Number.isFinite(report.longitude) &&
      Math.abs(report.latitude) <= 90 &&
      Math.abs(report.longitude) <= 180
  );

  const unpinnedReports = filteredReports.filter(
    (report) =>
      !Number.isFinite(report.latitude) ||
      !Number.isFinite(report.longitude)
  );

  const selectedReport =
    filteredReports.find((report) => report.dbId === selectedId) ||
    reports.find((report) => report.dbId === selectedId) ||
    null;

  const counts = {
    total: reports.length,
    open: reports.filter((r) => r.status === "Reported").length,
    progress: reports.filter((r) => r.status === "In Progress").length,
    resolved: reports.filter((r) => r.status === "Resolved").length,
    overdue: reports.filter((r) => r.is_overdue).length,
  };

  const averagePriority = reports.length
    ? Math.round(
        reports.reduce(
          (sum, report) => sum + Number(report.priority_score || 0),
          0
        ) / reports.length
      )
    : 0;

  async function addReport(event) {
    event.preventDefault();
    if (saving) return;

    const form = new FormData(event.currentTarget);

    const payload = {
      title: String(form.get("title") || "").trim(),
      category: form.get("category"),
      area: String(form.get("area") || "").trim(),
      severity: form.get("severity"),
      impact: Number(form.get("impact") || 3),
      description: String(form.get("description") || "").trim(),
      latitude: pickedLocation?.latitude,
      longitude: pickedLocation?.longitude,
    };

    if (!payload.title || !payload.area) {
      notify("Enter an issue title and location.");
      return;
    }

    if (!pickedLocation) {
      notify("Click the map to pin the report location first.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save the report.");
      }

      await loadReports();
      setShowForm(false);
      setPickedLocation(null);
      setActiveView("Map");
      setSearch("");
      setCategory("All");
      setStatus("All");
      setSeverity("All");
      setSelectedId(result.id);
      notify("Report saved to the database.");
    } catch (err) {
      console.error(err);
      notify(err.message || "Could not save report.");
    } finally {
      setSaving(false);
    }
  }

  async function advanceStatus(report) {
    const currentIndex = STATUSES.indexOf(report.status);
    const nextStatus = STATUSES[(currentIndex + 1) % STATUSES.length];

    try {
      const response = await fetch(
        `/api/reports/${report.dbId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not update status.");
      }

      await loadReports();
      notify(`Status changed to ${nextStatus}.`);
    } catch (err) {
      console.error(err);
      notify(err.message || "Could not update status.");
    }
  }

  function resetFilters() {
    setSearch("");
    setCategory("All");
    setStatus("All");
    setSeverity("All");
  }

  return (
    <div className="cp-app">
      <aside className="cp-sidebar">
        <a className="cp-brand" href="#top" onClick={() => setActiveView("Map")}>
          <span className="cp-brand-mark">C</span>
          <span>
            Civic<span>Pulse</span>
            <small>COMMUNITY OPERATIONS</small>
          </span>
        </a>

        <div className="cp-nav-label">WORKSPACE</div>
        <nav className="cp-nav">
          {[
            ["Map", "⌖", "Issue map"],
            ["Reports", "▤", "All reports"],
            ["Analytics", "▥", "Analytics"],
          ].map(([view, icon, label]) => (
            <button
              key={view}
              className={`cp-nav-item ${activeView === view ? "active" : ""}`}
              onClick={() => setActiveView(view)}
            >
              <span className="cp-nav-icon">{icon}</span>
              {label}
              {view === "Reports" && (
                <span className="cp-nav-count">{counts.total}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="cp-sidebar-bottom">
          <div className="cp-demo-note">
            <span className="cp-demo-dot" />
            DEMONSTRATION ENVIRONMENT
            <p>Fictional records for project use.</p>
          </div>
          <div className="cp-profile">
            <div className="cp-avatar">AD</div>
            <div>
              <strong>Admin Desk</strong>
              <small>Demo administrator</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="cp-main" id="top">
        <header className="cp-topbar">
          <div className="cp-breadcrumb">
            CivicPulse <span>/</span> <strong>{activeView}</strong>
          </div>
          <div className="cp-top-right">
            <span className="cp-live"><i /> API-connected view</span>
            <button className="cp-refresh" onClick={() => loadReports(true)}>
              ↻ <span>Refresh</span>
            </button>
            <button
              className="cp-primary"
              onClick={() => {
                setPickedLocation(null);
                setShowForm(true);
              }}
            >
              + New report
            </button>
          </div>
        </header>

        <div className="cp-content">
          <section className="cp-page-heading">
            <div>
              <div className="cp-eyebrow">CIVIC INTELLIGENCE PLATFORM</div>
              <h1>
                {activeView === "Map"
                  ? "Community issue map"
                  : activeView === "Reports"
                    ? "Report management"
                    : "Community analytics"}
              </h1>
              <p>
                Monitor fictional community reports and prioritize issues
                that need attention.
              </p>
            </div>
            <div className="cp-date-chip">
              <span>◷</span> Live database records
            </div>
          </section>

          {error && (
            <div className="cp-error">
              <strong>Connection issue</strong>
              <span>{error}</span>
              <button onClick={() => loadReports(true)}>Try again</button>
            </div>
          )}

          <section className="cp-metrics">
            <Metric
              label="TOTAL REPORTS"
              value={loading ? "…" : counts.total}
              icon="▤"
              tone="green"
              note="All stored reports"
            />
            <Metric
              label="AWAITING ACTION"
              value={loading ? "…" : counts.open}
              icon="◉"
              tone="orange"
              note="Reported"
            />
            <Metric
              label="IN PROGRESS"
              value={loading ? "…" : counts.progress}
              icon="↗"
              tone="blue"
              note="Being addressed"
            />
            <Metric
              label="OVERDUE"
              value={loading ? "…" : counts.overdue}
              icon="◷"
              tone="red"
              note="Open for 48+ hours"
            />
          </section>

          {activeView === "Analytics" ? (
            <section className="cp-analytics-grid">
              <div className="cp-panel">
                <PanelHeading
                  title="Reports by status"
                  subtitle="Distribution from current database records"
                />
                {STATUSES.map((label) => {
                  const value = reports.filter((r) => r.status === label).length;
                  const pct = reports.length
                    ? Math.round((value / reports.length) * 100)
                    : 0;

                  return (
                    <div className="cp-analytics-row" key={label}>
                      <div>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                      <div className="cp-progress-track">
                        <div
                          className={`cp-progress-fill ${label.toLowerCase().replace(" ", "-")}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <small>{pct}%</small>
                    </div>
                  );
                })}
              </div>

              <div className="cp-panel">
                <PanelHeading
                  title="Reports by category"
                  subtitle="Current complaint distribution"
                />
                {CATEGORIES.map((label) => {
                  const value = reports.filter((r) => r.category === label).length;
                  const pct = reports.length
                    ? Math.round((value / reports.length) * 100)
                    : 0;

                  return (
                    <div className="cp-analytics-row" key={label}>
                      <div>
                        <span>
                          {CATEGORY_ICONS[label]} &nbsp;{label}
                        </span>
                        <strong>{value}</strong>
                      </div>
                      <div className="cp-progress-track">
                        <div
                          className="cp-progress-fill category-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <small>{pct}%</small>
                    </div>
                  );
                })}
              </div>

              <div className="cp-panel cp-summary-panel">
                <PanelHeading
                  title="Priority overview"
                  subtitle="Illustrative backend scoring model"
                />
                <div className="cp-score">{averagePriority}<small>/100</small></div>
                <p>Average priority score across all stored reports.</p>
                <div className="cp-summary-stat">
                  <span>Critical severity</span>
                  <strong>
                    {reports.filter((r) => r.severity === "Critical").length}
                  </strong>
                </div>
                <div className="cp-summary-stat">
                  <span>Reports without map pins</span>
                  <strong>{reports.length - reports.filter((r) => r.latitude != null && r.longitude != null).length}</strong>
                </div>
                <div className="cp-summary-stat">
                  <span>Resolved</span>
                  <strong>{counts.resolved}</strong>
                </div>
              </div>
            </section>
          ) : (
            <section className="cp-workspace">
              <div className="cp-map-column">
                <div className="cp-panel cp-map-panel">
                  <div className="cp-map-header">
                    <div>
                      <h2>Issue distribution</h2>
                      <p>
                        {mappedReports.length} pinned issues · illustrative
                        coordinates
                      </p>
                    </div>
                    <span className="cp-map-tag"><i /> MAP VIEW</span>
                  </div>

                  <div className="cp-map-frame">
                    <MapContainer
                      center={CENTER}
                      zoom={12}
                      scrollWheelZoom
                      className="cp-leaflet-map"
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />

                      <MapFocus report={selectedReport} />

                      {mappedReports.map((report) => (
                        <CircleMarker
                          key={report.dbId}
                          center={[report.latitude, report.longitude]}
                          radius={selectedId === report.dbId ? 11 : 8}
                          pathOptions={{
                            color: "#ffffff",
                            weight: selectedId === report.dbId ? 3 : 2,
                            fillColor: SEVERITY_COLORS[report.severity] || "#4c9b79",
                            fillOpacity: 0.95,
                          }}
                          eventHandlers={{
                            click: () => setSelectedId(report.dbId),
                          }}
                        >
                          <Popup>
                            <div className="cp-popup">
                              <strong>{report.title}</strong>
                              <span>{report.area} · {report.severity}</span>
                              <small>{report.status} · {report.displayId}</small>
                              <button onClick={() => setSelectedId(report.dbId)}>
                                View report
                              </button>
                            </div>
                          </Popup>
                        </CircleMarker>
                      ))}
                    </MapContainer>

                    <div className="cp-map-legend">
                      <strong>Priority</strong>
                      {Object.entries(SEVERITY_COLORS).map(([label, color]) => (
                        <span key={label}>
                          <i style={{ background: color }} /> {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="cp-map-footer">
                    <span><i className="cp-map-pin-dot" /> {mappedReports.length} on map</span>
                    <span>{unpinnedReports.length} without coordinates</span>
                    <span>Map markers use fictional demo locations</span>
                  </div>
                </div>

                <div className="cp-panel cp-queue-panel">
                  <div className="cp-section-heading">
                    <PanelHeading
                      title={activeView === "Reports" ? "All reports" : "Priority queue"}
                      subtitle="Sorted by backend priority score"
                    />
                    <span className="cp-queue-count">{filteredReports.length} records</span>
                  </div>

                  <div className="cp-filters">
                    <div className="cp-search">
                      <span>⌕</span>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search issues, areas, IDs..."
                      />
                    </div>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="All">All categories</option>
                      {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="All">All statuses</option>
                      {STATUSES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                      <option value="All">All priorities</option>
                      {SEVERITIES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <button className="cp-reset" onClick={resetFilters}>Reset</button>
                  </div>

                  {loading ? (
                    <div className="cp-empty">Loading reports from MySQL…</div>
                  ) : filteredReports.length === 0 ? (
                    <div className="cp-empty">No reports match these filters.</div>
                  ) : (
                    <div className="cp-report-list">
                      {[...filteredReports]
                        .sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0))
                        .map((report) => (
                          <button
                            key={report.dbId}
                            className={`cp-report-row ${selectedId === report.dbId ? "selected" : ""}`}
                            onClick={() => setSelectedId(report.dbId)}
                          >
                            <span
                              className="cp-report-symbol"
                              style={{ "--severity-color": SEVERITY_COLORS[report.severity] || "#4c9b79" }}
                            >
                              {CATEGORY_ICONS[report.category] || "•"}
                            </span>
                            <span className="cp-report-main">
                              <strong>{report.title}</strong>
                              <small>{report.area} · {report.displayId}</small>
                              <span className="cp-report-meta">
                                {report.category} <i /> {formatAge(report.age_hours)}
                              </span>
                            </span>
                            <span className="cp-report-end">
                              <span className={`cp-severity ${report.severity.toLowerCase()}`}>
                                {report.severity}
                              </span>
                              <strong>{Math.round(Number(report.priority_score || 0))}</strong>
                              <small>score</small>
                            </span>
                          </button>
                        ))}
                    </div>
                  )}

                  {unpinnedReports.length > 0 && (
                    <div className="cp-unpinned-note">
                      <span>ⓘ</span>
                      {unpinnedReports.length} report(s) have no coordinates and are shown in the list, not on the map.
                    </div>
                  )}
                </div>
              </div>

              <aside className="cp-detail-column">
                <div className="cp-panel cp-detail-panel">
                  <PanelHeading
                    title="Report details"
                    subtitle="Select an issue to inspect it"
                  />

                  {selectedReport ? (
                    <>
                      <div
                        className="cp-detail-symbol"
                        style={{ "--severity-color": SEVERITY_COLORS[selectedReport.severity] || "#4c9b79" }}
                      >
                        {CATEGORY_ICONS[selectedReport.category] || "•"}
                      </div>

                      <div className="cp-detail-id">{selectedReport.displayId}</div>
                      <h3>{selectedReport.title}</h3>
                      <div className="cp-detail-badges">
                        <span className={`cp-severity ${selectedReport.severity.toLowerCase()}`}>
                          {selectedReport.severity}
                        </span>
                        <span className={`cp-status ${selectedReport.status.toLowerCase().replace(" ", "-")}`}>
                          {selectedReport.status}
                        </span>
                      </div>

                      <div className="cp-detail-divider" />

                      <Detail label="Location" value={selectedReport.area || "Not specified"} />
                      <Detail label="Category" value={selectedReport.category} />
                      <Detail label="Department" value={selectedReport.department || "Not assigned"} />
                      <Detail label="Reported" value={formatDate(selectedReport.created_at)} />
                      <Detail label="Community impact" value={`${selectedReport.impact || 3} / 5`} />
                      <Detail label="Priority score" value={`${Math.round(Number(selectedReport.priority_score || 0))} / 100`} />
                      <Detail
                        label="Map coordinates"
                        value={
                          selectedReport.latitude != null && selectedReport.longitude != null
                            ? `${selectedReport.latitude.toFixed(4)}, ${selectedReport.longitude.toFixed(4)}`
                            : "Not pinned"
                        }
                      />

                      {selectedReport.is_overdue && (
                        <div className="cp-overdue-banner">
                          <strong>Overdue</strong>
                          <span>Open for at least 48 hours.</span>
                        </div>
                      )}

                      <div className="cp-detail-description">
                        <label>DESCRIPTION</label>
                        <p>{selectedReport.description || "No additional description provided."}</p>
                      </div>

                      <button
                        className="cp-primary cp-full"
                        onClick={() => advanceStatus(selectedReport)}
                      >
                        Advance status <span>↗</span>
                      </button>
                      <p className="cp-detail-hint">
                        Demo action: Reported → In Progress → Resolved → Reported.
                      </p>
                    </>
                  ) : (
                    <div className="cp-detail-empty">
                      <span>⌖</span>
                      <strong>No report selected</strong>
                      <p>Select a map marker or report in the queue to see its details.</p>
                    </div>
                  )}
                </div>

                <div className="cp-panel cp-priority-guide">
                  <h3>Priority guide</h3>
                  <p>Scores are illustrative and calculated by the backend.</p>
                  {Object.entries(SEVERITY_COLORS).map(([label, color]) => (
                    <div key={label}>
                      <span><i style={{ background: color }} />{label}</span>
                      <small>{label === "Critical" ? "Immediate review" : label === "High" ? "High attention" : label === "Medium" ? "Routine follow-up" : "Lower urgency"}</small>
                    </div>
                  ))}
                </div>
              </aside>
            </section>
          )}

          <footer className="cp-footer">
            <span>© 2026 CivicPulse</span>
            <span>Fictional demo dataset · Not an official municipal service</span>
          </footer>
        </div>
      </main>

      {showForm && (
        <div
          className="cp-modal-backdrop"
          onClick={() => {
            if (!saving) {
              setShowForm(false);
              setPickedLocation(null);
            }
          }}
        >
          <div className="cp-modal" onClick={(event) => event.stopPropagation()}>
            <div className="cp-modal-heading">
              <div>
                <div className="cp-eyebrow">DEMO REPORT SUBMISSION</div>
                <h2>Report a community issue</h2>
                <p>Fill in the details, then click the map to pin the exact location.</p>
              </div>
              <button
                className="cp-modal-close"
                onClick={() => {
                  setShowForm(false);
                  setPickedLocation(null);
                }}
                disabled={saving}
              >×</button>
            </div>

            <form onSubmit={addReport}>
              <label>Issue title
                <input name="title" required maxLength={180} placeholder="e.g. Pothole near the bus stop" />
              </label>
              <div className="cp-form-grid">
                <label>Category
                  <select name="category" defaultValue="Roads">
                    {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>Severity
                  <select name="severity" defaultValue="Medium">
                    {SEVERITIES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              <label>Location or area
                <input name="area" required maxLength={180} placeholder="e.g. Sector 12, Nerul" />
              </label>

              <div style={{ margin: "14px 0 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                  <strong style={{ fontSize: "14px" }}>Pin the report on the map</strong>
                  <span style={{ fontSize: "12px", color: pickedLocation ? "#24765d" : "#b7791f" }}>
                    {pickedLocation ? "Location selected" : "Click map to select"}
                  </span>
                </div>
                <div style={{ height: "250px", width: "100%", overflow: "hidden", borderRadius: "12px", border: "1px solid #d9e1e8", position: "relative", zIndex: 0 }}>
                  <MapContainer
                    center={pickedLocation ? [pickedLocation.latitude, pickedLocation.longitude] : CENTER}
                    zoom={12}
                    scrollWheelZoom
                    className="cp-leaflet-map"
                    style={{ height: "100%", width: "100%", cursor: "crosshair" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationPickerEvents onPick={setPickedLocation} />
                    {pickedLocation && (
                      <CircleMarker
                        center={[pickedLocation.latitude, pickedLocation.longitude]}
                        radius={10}
                        pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#24765d", fillOpacity: 1 }}
                      >
                        <Popup>Selected report location</Popup>
                      </CircleMarker>
                    )}
                  </MapContainer>
                </div>
                <p style={{ fontSize: "12px", lineHeight: 1.5, margin: "8px 0 0", color: "#64748b" }}>
                  Click anywhere on the map to place the pin. Click another spot to move it.
                </p>
                {pickedLocation && (
                  <div style={{ marginTop: "8px", padding: "9px 11px", borderRadius: "8px", background: "#edf7f1", color: "#1f6249", fontSize: "12px", overflowWrap: "anywhere" }}>
                    <strong>Latitude:</strong> {pickedLocation.latitude.toFixed(6)} &nbsp; <strong>Longitude:</strong> {pickedLocation.longitude.toFixed(6)}
                  </div>
                )}
              </div>

              <label>Community impact
                <select name="impact" defaultValue="3">
                  <option value="1">1 · Very low</option>
                  <option value="2">2 · Low</option>
                  <option value="3">3 · Moderate</option>
                  <option value="4">4 · High</option>
                  <option value="5">5 · Very high</option>
                </select>
              </label>
              <label>Description
                <textarea name="description" rows="3" maxLength={2000} placeholder="Describe the issue..." />
              </label>
              <button className="cp-primary cp-full" type="submit" disabled={saving}>
                {saving ? "Saving report..." : "Save report →"}
              </button>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="cp-toast">{toast}</div>}
    </div>
  );
}

function Metric({ label, value, icon, tone, note }) {
  return (
    <article className="cp-metric-card">
      <div className={`cp-metric-icon ${tone}`}>{icon}</div>
      <div className="cp-metric-label">{label}</div>
      <div className="cp-metric-value">{value}</div>
      <div className="cp-metric-note">{note}</div>
    </article>
  );
}

function PanelHeading({ title, subtitle }) {
  return (
    <div className="cp-panel-heading">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="cp-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
