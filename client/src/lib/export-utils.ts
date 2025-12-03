/**
 * Utilities for exporting data to various formats
 */

type CsvRow = Record<string, string | number | boolean | null | undefined>;

/**
 * Escapes a value for CSV format
 */
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // If the value contains a comma, newline, or double quote, wrap it in quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    // Escape double quotes by doubling them
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

/**
 * Converts an array of objects to CSV format
 */
export function convertToCSV(data: CsvRow[], headers?: string[]): string {
  if (data.length === 0) {
    return headers ? headers.join(',') : '';
  }
  
  // Use provided headers or extract from first object
  const columnHeaders = headers || Object.keys(data[0]);
  
  const headerRow = columnHeaders.map(escapeCsvValue).join(',');
  
  const dataRows = data.map(row => 
    columnHeaders.map(header => escapeCsvValue(row[header])).join(',')
  );
  
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Triggers a file download in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
}

/**
 * Exports data as a CSV file download
 */
export function exportToCSV(data: CsvRow[], filename: string, headers?: string[]): void {
  const csv = convertToCSV(data, headers);
  downloadFile(csv, filename, 'text/csv');
}

/**
 * Formats a date for display in reports
 */
export function formatReportDate(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return 'Invalid Date';
  
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Generates a timestamp string for filenames
 */
export function getReportTimestamp(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

type DashboardReportData = {
  metrics: {
    activeCandidates: number;
    tasksDue7Days: number;
    overdueTasks: number;
    completionRate: number;
  };
  upcomingStarts: Array<{
    name: string;
    type: string;
    startDate: string;
    status: string;
  }>;
  urgentTasks: Array<{
    title: string;
    candidateName: string;
    dueDate: string;
    priority: string;
    status: string;
  }>;
  divisionOverview: Array<{
    division: string;
    department: string;
    activeCandidates: number;
  }>;
};

/**
 * Generates a comprehensive dashboard report as a multi-section CSV
 */
export function generateDashboardReport(data: DashboardReportData): string {
  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const sections: string[] = [];
  
  // Header
  sections.push('OnboardPro Dashboard Report');
  sections.push(`Generated: ${timestamp}`);
  sections.push('');
  
  // Metrics Summary
  sections.push('=== DASHBOARD METRICS ===');
  sections.push('Metric,Value');
  sections.push(`Active Candidates,${data.metrics.activeCandidates}`);
  sections.push(`Tasks Due (7 Days),${data.metrics.tasksDue7Days}`);
  sections.push(`Overdue Tasks,${data.metrics.overdueTasks}`);
  sections.push(`Completion Rate,${data.metrics.completionRate}%`);
  sections.push('');
  
  // Upcoming Starts
  sections.push('=== UPCOMING STARTS ===');
  if (data.upcomingStarts.length > 0) {
    sections.push('Name,Type,Start Date,Status');
    data.upcomingStarts.forEach(candidate => {
      sections.push(`${escapeCsvValue(candidate.name)},${escapeCsvValue(candidate.type)},${candidate.startDate},${candidate.status}`);
    });
  } else {
    sections.push('No upcoming starts scheduled');
  }
  sections.push('');
  
  // Urgent Tasks
  sections.push('=== URGENT/OVERDUE TASKS ===');
  if (data.urgentTasks.length > 0) {
    sections.push('Task,Candidate,Due Date,Priority,Status');
    data.urgentTasks.forEach(task => {
      sections.push(`${escapeCsvValue(task.title)},${escapeCsvValue(task.candidateName)},${task.dueDate},${task.priority},${task.status}`);
    });
  } else {
    sections.push('No urgent or overdue tasks');
  }
  sections.push('');
  
  // Division Overview
  sections.push('=== DIVISION OVERVIEW ===');
  if (data.divisionOverview.length > 0) {
    sections.push('Division,Department,Active Candidates');
    data.divisionOverview.forEach(division => {
      sections.push(`${escapeCsvValue(division.division)},${escapeCsvValue(division.department)},${division.activeCandidates}`);
    });
  } else {
    sections.push('No division data available');
  }
  
  return sections.join('\n');
}

/**
 * Downloads a dashboard report
 */
export function downloadDashboardReport(data: DashboardReportData): void {
  const report = generateDashboardReport(data);
  const timestamp = getReportTimestamp();
  downloadFile(report, `onboardpro-dashboard-report-${timestamp}.csv`, 'text/csv');
}
