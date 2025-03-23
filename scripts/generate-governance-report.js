/**
 * Generate a comprehensive upgrade governance report
 * This script creates a detailed HTML report of the upgrade governance system,
 * including proposals, voting history, delegations, and audit logs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Constants
const UPGRADE_GOVERNANCE_PATH = path.resolve(process.cwd(), 'upgrade-governance.json');
const GOVERNANCE_AUDIT_LOG_PATH = path.resolve(process.cwd(), 'governance-audit.log');
const REPORT_OUTPUT_PATH = path.resolve(process.cwd(), 'governance-report.html');

// Check if governance files exist
if (!fs.existsSync(UPGRADE_GOVERNANCE_PATH)) {
  console.error('Upgrade governance configuration not found. Initialize it first.');
  process.exit(1);
}

// Load governance data
const governance = JSON.parse(fs.readFileSync(UPGRADE_GOVERNANCE_PATH, 'utf-8'));

// Load audit logs if available
let auditLogs = [];
if (fs.existsSync(GOVERNANCE_AUDIT_LOG_PATH)) {
  const logData = fs.readFileSync(GOVERNANCE_AUDIT_LOG_PATH, 'utf-8');
  auditLogs = logData
    .trim()
    .split('\n')
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(entry => entry !== null);
}

// Generate report
function generateReport() {
  const now = new Date();
  
  // Sort proposals by status and date
  const sortedProposals = [...governance.proposals].sort((a, b) => {
    // First by status: proposed -> approved -> executed -> rejected
    const statusOrder = { proposed: 0, approved: 1, executed: 2, rejected: 3 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    
    if (statusDiff !== 0) return statusDiff;
    
    // Then by date (newer first)
    return new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime();
  });
  
  // Get active delegations
  const activeDelegations = Object.entries(governance.delegations || {})
    .filter(([_, delegation]) => new Date(delegation.expiresAt) > now)
    .map(([member, delegation]) => ({
      member,
      delegate: delegation.delegateTo,
      expiresAt: delegation.expiresAt,
      daysRemaining: Math.ceil((new Date(delegation.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }));
  
  // Generate HTML content
  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VCoin Upgrade Governance Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1100px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f2f2f2;
    }
    .status {
      display: inline-block;
      padding: 5px 8px;
      border-radius: 4px;
      font-weight: bold;
    }
    .proposed { background-color: #f4d03f; color: #333; }
    .approved { background-color: #2ecc71; color: white; }
    .executed { background-color: #3498db; color: white; }
    .rejected { background-color: #e74c3c; color: white; }
    .emergency { background-color: #e67e22; color: white; }
    .card {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .overview {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .overview div {
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 0.9em;
      color: #777;
    }
    .tabs {
      display: flex;
      margin-bottom: 15px;
    }
    .tab {
      padding: 10px 15px;
      cursor: pointer;
      border: 1px solid #ddd;
      border-bottom: none;
      background-color: #f2f2f2;
      border-radius: 4px 4px 0 0;
      margin-right: 5px;
    }
    .tab.active {
      background-color: white;
      font-weight: bold;
    }
    .tab-content {
      display: none;
      border: 1px solid #ddd;
      padding: 15px;
      border-radius: 0 0 4px 4px;
    }
    .tab-content.active {
      display: block;
    }
    .audit-entry {
      border-left: 3px solid #3498db;
      padding-left: 15px;
      margin-bottom: 15px;
    }
    .vote-badge {
      display: inline-block;
      padding: 3px 6px;
      border-radius: 3px;
      font-size: 0.8em;
      margin-right: 5px;
    }
    .vote-approve { background-color: #2ecc71; color: white; }
    .vote-reject { background-color: #e74c3c; color: white; }
  </style>
</head>
<body>
  <h1>VCoin Upgrade Governance Report</h1>
  <p>Generated on ${now.toLocaleString()}</p>
  
  <div class="overview">
    <div>
      <h3>Council Size</h3>
      <p>${governance.council.length} members</p>
    </div>
    <div>
      <h3>Regular Approval</h3>
      <p>Threshold: ${governance.threshold} votes</p>
      <p>Timelock: ${governance.timelock} days</p>
    </div>
    <div>
      <h3>Emergency Approval</h3>
      <p>Threshold: ${governance.emergencyThreshold} votes</p>
      <p>Timelock: ${governance.emergencyTimelock} days</p>
    </div>
    <div>
      <h3>Proposals</h3>
      <p>Total: ${governance.proposals.length}</p>
      <p>Active: ${governance.proposals.filter(p => p.status === 'proposed' || p.status === 'approved').length}</p>
    </div>
  </div>
  
  <div class="tabs">
    <div class="tab active" onclick="switchTab('proposals')">Proposals</div>
    <div class="tab" onclick="switchTab('delegations')">Delegations</div>
    <div class="tab" onclick="switchTab('council')">Council</div>
    <div class="tab" onclick="switchTab('audit')">Audit Log</div>
  </div>
  
  <div id="proposals" class="tab-content active">
    <h2>Upgrade Proposals</h2>
    ${sortedProposals.length === 0 ? '<p>No proposals found.</p>' : ''}
    ${sortedProposals.map(proposal => `
      <div class="card">
        <h3>
          ${proposal.isEmergency ? '<span class="status emergency">EMERGENCY</span> ' : ''}
          <span class="status ${proposal.status}">${proposal.status.toUpperCase()}</span>
          ${proposal.description.split('\n')[0]}
        </h3>
        <p><strong>ID:</strong> ${proposal.id}</p>
        <p><strong>Proposed by:</strong> ${proposal.proposedBy}</p>
        <p><strong>Proposed at:</strong> ${new Date(proposal.proposedAt).toLocaleString()}</p>
        ${proposal.status === 'executed' && proposal.executedAt ? 
          `<p><strong>Executed at:</strong> ${new Date(proposal.executedAt).toLocaleString()}</p>` : ''}
        ${proposal.status === 'rejected' && proposal.rejectedAt ? 
          `<p><strong>Rejected at:</strong> ${new Date(proposal.rejectedAt).toLocaleString()}</p>` : ''}
        ${['proposed', 'approved'].includes(proposal.status) ? 
          `<p><strong>Executable after:</strong> ${new Date(proposal.executeAfter).toLocaleString()}</p>` : ''}
        
        <p><strong>Files:</strong></p>
        <ul>
          ${proposal.files.map(file => `<li>${file.path} <small>(checksum: ${file.checksum.substring(0, 8)}...)</small></li>`).join('')}
        </ul>
        
        <p><strong>Votes:</strong> (${proposal.votes.filter(v => v.approved).length} approve, 
           ${proposal.votes.filter(v => !v.approved).length} reject, 
           threshold: ${proposal.isEmergency ? governance.emergencyThreshold : governance.threshold})</p>
        
        <table>
          <tr>
            <th>Council Member</th>
            <th>Vote</th>
            <th>Time</th>
            <th>Notes</th>
          </tr>
          ${proposal.votes.map(vote => `
            <tr>
              <td>${vote.address}</td>
              <td><span class="vote-badge vote-${vote.approved ? 'approve' : 'reject'}">${vote.approved ? 'Approve' : 'Reject'}</span></td>
              <td>${new Date(vote.timestamp).toLocaleString()}</td>
              <td>${vote.votedBy ? `<em>Voted by delegate: ${vote.votedBy}</em>` : ''}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `).join('')}
  </div>
  
  <div id="delegations" class="tab-content">
    <h2>Active Delegations</h2>
    ${activeDelegations.length === 0 ? '<p>No active delegations found.</p>' : ''}
    ${activeDelegations.length > 0 ? `
      <table>
        <tr>
          <th>Council Member</th>
          <th>Delegated To</th>
          <th>Expires</th>
          <th>Days Remaining</th>
        </tr>
        ${activeDelegations.map(delegation => `
          <tr>
            <td>${delegation.member}</td>
            <td>${delegation.delegate}</td>
            <td>${new Date(delegation.expiresAt).toLocaleString()}</td>
            <td>${delegation.daysRemaining}</td>
          </tr>
        `).join('')}
      </table>
    ` : ''}
  </div>
  
  <div id="council" class="tab-content">
    <h2>Council Members</h2>
    <table>
      <tr>
        <th>#</th>
        <th>Address</th>
        <th>Delegation Status</th>
      </tr>
      ${governance.council.map((member, index) => {
        const delegation = governance.delegations && governance.delegations[member];
        const hasActiveDelegation = delegation && new Date(delegation.expiresAt) > now;
        
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${member}</td>
            <td>
              ${hasActiveDelegation ? 
                `Delegated to ${delegation.delegateTo} until ${new Date(delegation.expiresAt).toLocaleString()}` : 
                'No active delegation'}
            </td>
          </tr>
        `;
      }).join('')}
    </table>
  </div>
  
  <div id="audit" class="tab-content">
    <h2>Audit Log</h2>
    ${auditLogs.length === 0 ? '<p>No audit log entries found.</p>' : ''}
    ${auditLogs.slice(-30).reverse().map(entry => `
      <div class="audit-entry">
        <p><strong>${new Date(entry.timestamp).toLocaleString()}</strong>: ${entry.action} by ${entry.actor}</p>
        <p>${entry.details}</p>
        ${entry.metadata && Object.keys(entry.metadata).filter(k => !['hostname', 'platform', 'networkInterfaces'].includes(k)).length > 0 ? `
          <details>
            <summary>Additional details</summary>
            <pre>${JSON.stringify(
              Object.fromEntries(
                Object.entries(entry.metadata)
                  .filter(([k]) => !['hostname', 'platform', 'networkInterfaces'].includes(k))
              ), 
              null, 2
            )}</pre>
          </details>
        ` : ''}
      </div>
    `).join('')}
  </div>
  
  <div class="footer">
    <p>VCoin Upgrade Governance System | Report hash: ${
      crypto.createHash('sha256').update(now.toISOString()).digest('hex').substring(0, 8)
    }</p>
  </div>
  
  <script>
    function switchTab(tabId) {
      // Hide all tab contents
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });
      
      // Deactivate all tabs
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });
      
      // Activate selected tab
      document.getElementById(tabId).classList.add('active');
      
      // Find and activate the tab button
      document.querySelectorAll('.tab').forEach(tab => {
        if (tab.textContent.toLowerCase().includes(tabId)) {
          tab.classList.add('active');
        }
      });
    }
  </script>
</body>
</html>`;

  // Write report to file
  fs.writeFileSync(REPORT_OUTPUT_PATH, html, 'utf-8');
  
  console.log(`Governance report generated: ${REPORT_OUTPUT_PATH}`);
  console.log(`Open the file in a browser to view the report.`);
}

generateReport(); 