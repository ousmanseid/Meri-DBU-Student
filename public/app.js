/**
 * MERI DBU STUDENT: MASTER CLIENT APPLICATION JAVASCRIPT
 * Debre Berhan University (DBU), Ethiopia
 */

class MeriApp {
  constructor() {
    this.token = localStorage.getItem('dbu_session_token') || null;
    this.user = JSON.parse(localStorage.getItem('dbu_user_data') || 'null');
    this.currentBatchId = null;
    this.currentReviewBatchId = null;

    this.init();
  }

  init() {
    this.updateAuthUi();
    this.loadPublicAnnouncements();
    if (this.user) {
      this.routeToAuthorizedDashboard();
    }
  }

  // --- API Client Helper ---
  async api(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(options.headers || {}),
    };

    try {
      const res = await fetch(`/api/v1${endpoint}`, {
        ...options,
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }
      return data;
    } catch (err) {
      this.showToast(err.message, 'danger');
      throw err;
    }
  }

  // --- Navigation & View Switching ---
  showTab(tabName) {
    document.querySelectorAll('.tab-pane').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach((el) => el.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tabName}`);
    const targetNav = document.getElementById(`nav-${tabName}`);

    if (targetTab) targetTab.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    // Trigger tab-specific data loading
    if (tabName === 'student' && this.user) this.loadStudentData();
    if (tabName === 'dean' && this.user) this.loadDeanData();
    if (tabName === 'registrar' && this.user) this.loadRegistrarData();
    if (tabName === 'audit' && this.user) this.loadAuditLogs();
  }

  routeToAuthorizedDashboard() {
    if (!this.user) return;
    const roles = this.user.roles || [];
    if (roles.includes('FRESHMAN') || roles.includes('SENIOR')) {
      this.showTab('student');
    } else if (roles.includes('DEAN')) {
      this.showTab('dean');
    } else if (roles.includes('REGISTRAR')) {
      this.showTab('registrar');
    } else if (roles.includes('AUDITOR')) {
      this.showTab('audit');
    }
  }

  // --- Authentication ---
  updateAuthUi() {
    const container = document.getElementById('auth-nav-container');
    if (!container) return;

    if (this.user && this.token) {
      container.innerHTML = `
        <div class="user-badge">
          <span class="role-pill">${this.user.roles[0] || 'USER'}</span>
          <span style="font-size: 0.85rem; font-weight: 600; color: #ffffff;">${this.user.username}</span>
          <button class="nav-btn" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="app.logout()">Sign Out</button>
        </div>
      `;
      // Show dashboard panes
      if (document.getElementById('student-unauth-notice')) document.getElementById('student-unauth-notice').style.display = 'none';
      if (document.getElementById('student-dashboard-content')) document.getElementById('student-dashboard-content').style.display = 'block';

      if (document.getElementById('dean-unauth-notice')) document.getElementById('dean-unauth-notice').style.display = 'none';
      if (document.getElementById('dean-dashboard-content')) document.getElementById('dean-dashboard-content').style.display = 'block';

      if (document.getElementById('reg-unauth-notice')) document.getElementById('reg-unauth-notice').style.display = 'none';
      if (document.getElementById('reg-dashboard-content')) document.getElementById('reg-dashboard-content').style.display = 'block';

      if (document.getElementById('audit-unauth-notice')) document.getElementById('audit-unauth-notice').style.display = 'none';
      if (document.getElementById('audit-dashboard-content')) document.getElementById('audit-dashboard-content').style.display = 'block';
    } else {
      container.innerHTML = `
        <button class="nav-btn gold" onclick="app.openLoginModal()">Sign In</button>
      `;
    }
  }

  async executeLogin() {
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;

    if (!identifier || !password) {
      return this.showToast('Please enter both identifier and password', 'warning');
    }

    try {
      const data = await this.api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });

      this.token = data.sessionToken;
      this.user = {
        userId: data.userId,
        username: data.username,
        email: data.email,
        roles: data.roles,
        scopes: data.scopes,
      };

      localStorage.setItem('dbu_session_token', this.token);
      localStorage.setItem('dbu_user_data', JSON.stringify(this.user));

      this.closeModal('modal-login');
      this.updateAuthUi();
      this.showToast(`Welcome back, ${data.username}!`, 'success');
      this.routeToAuthorizedDashboard();
    } catch {
      // Error handled in api()
    }
  }

  fillLogin(identifier) {
    document.getElementById('login-identifier').value = identifier;
    document.getElementById('login-password').value = 'DbuSecure2026!';
  }

  demoLogin(role) {
    this.openLoginModal();
    if (role === 'DEAN') this.fillLogin('dean.ceng@dbu.edu.et');
    if (role === 'REGISTRAR') this.fillLogin('registrar@dbu.edu.et');
    if (role === 'AUDITOR') this.fillLogin('auditor@dbu.edu.et');
  }

  async logout() {
    try {
      if (this.token) {
        await this.api('/auth/logout', { method: 'POST' });
      }
    } catch {
      // Continue cleanup
    }
    this.token = null;
    this.user = null;
    localStorage.removeItem('dbu_session_token');
    localStorage.removeItem('dbu_user_data');
    this.updateAuthUi();
    this.showToast('You have signed out.', 'info');
    window.location.reload();
  }

  // --- Account Activation ---
  switchActivationType(type) {
    const freshBtn = document.getElementById('btn-tab-act-freshman');
    const seniorBtn = document.getElementById('btn-tab-act-senior');
    const freshForm = document.getElementById('act-freshman-form');
    const seniorForm = document.getElementById('act-senior-form');

    if (type === 'freshman') {
      freshBtn.className = 'btn btn-primary';
      seniorBtn.className = 'btn btn-outline';
      seniorBtn.style.color = 'var(--dbu-primary)';
      seniorBtn.style.borderColor = 'var(--dbu-primary)';
      freshForm.style.display = 'block';
      seniorForm.style.display = 'none';
    } else {
      seniorBtn.className = 'btn btn-primary';
      freshBtn.className = 'btn btn-outline';
      freshBtn.style.color = 'var(--dbu-primary)';
      freshBtn.style.borderColor = 'var(--dbu-primary)';
      seniorForm.style.display = 'block';
      freshForm.style.display = 'none';
    }
  }

  async verifyFreshmanEligibility() {
    const admissionSlipNumber = document.getElementById('act-slip').value.trim();
    const entranceExamId = document.getElementById('act-exam-id').value.trim();
    const firstName = document.getElementById('act-first-name').value.trim();
    const lastName = document.getElementById('act-last-name').value.trim();
    const email = document.getElementById('act-email').value.trim();

    try {
      const data = await this.api('/activation/freshman/verify', {
        method: 'POST',
        body: JSON.stringify({ admissionSlipNumber, entranceExamId, firstName, lastName, email }),
      });

      if (!data.success) {
        return this.showToast(data.message, 'danger');
      }

      this.showToast('Eligibility verified! Single-use token generated.', 'success');
      document.getElementById('act-step-1').style.display = 'none';
      document.getElementById('act-step-2').style.display = 'block';
      document.getElementById('act-token').value = data.verificationToken;
    } catch {
      // Handled
    }
  }

  async verifySeniorEligibility() {
    const studentIdNumber = document.getElementById('act-senior-id').value.trim();
    const fullName = document.getElementById('act-senior-name').value.trim();
    const email = document.getElementById('act-senior-email').value.trim();

    try {
      const data = await this.api('/activation/senior/verify', {
        method: 'POST',
        body: JSON.stringify({ studentIdNumber, fullName, email }),
      });

      if (!data.success) {
        return this.showToast(data.message, 'danger');
      }

      this.showToast('Senior enrollment confirmed! Token generated.', 'success');
      document.getElementById('act-step-1').style.display = 'none';
      document.getElementById('act-step-2').style.display = 'block';
      document.getElementById('act-token').value = data.verificationToken;
    } catch {
      // Handled
    }
  }

  async completeActivation() {
    const token = document.getElementById('act-token').value.trim();
    const password = document.getElementById('act-password').value;

    if (!password || password.length < 8) {
      return this.showToast('Password must be at least 8 characters.', 'warning');
    }

    try {
      const data = await this.api('/activation/complete', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      this.activatedCredentials = {
        username: data.username,
        password: password,
      };

      document.getElementById('act-step-2').style.display = 'none';
      document.getElementById('act-step-3').style.display = 'block';
      document.getElementById('act-assigned-username').textContent = data.username;
      this.showToast('Account activated successfully!', 'success');
    } catch {
      // Handled
    }
  }

  async loginWithActivatedUser() {
    if (this.activatedCredentials) {
      document.getElementById('login-identifier').value = this.activatedCredentials.username;
      document.getElementById('login-password').value = this.activatedCredentials.password;
      await this.executeLogin();
    } else {
      this.openLoginModal();
    }
  }

  // --- Student Dashboard ---
  async loadStudentData() {
    try {
      const profileData = await this.api('/student/profile');
      if (profileData.profile) {
        const p = profileData.profile;
        document.getElementById('stu-name').textContent = `${p.first_name} ${p.last_name}`;
        document.getElementById('stu-id-badge').textContent = p.student_id_number;
        document.getElementById('stu-status-badge').textContent = `${p.enrollment_status} ENROLLMENT`;
        document.getElementById('stu-dept').textContent = p.department_name || 'Engineering';
        document.getElementById('stu-college').textContent = p.college_name || 'Computing';
        document.getElementById('corr-old').value = p.last_name;
      }

      const reqData = await this.api('/student/requests');
      const tbody = document.getElementById('student-requests-tbody');
      if (reqData.requests && reqData.requests.length > 0) {
        tbody.innerHTML = reqData.requests
          .map(
            (r) => `
          <tr>
            <td><strong>${r.ticket_number}</strong></td>
            <td>${r.service_type}</td>
            <td>${r.subject}</td>
            <td><span class="badge ${r.status === 'RESOLVED' ? 'badge-success' : 'badge-warning'}">${r.status}</span></td>
            <td>${new Date(r.created_at).toLocaleDateString()}</td>
          </tr>
        `
          )
          .join('');
      }
    } catch {}
  }

  async submitServiceRequest() {
    const serviceType = document.getElementById('req-service-type').value;
    const subject = document.getElementById('req-subject').value.trim();
    const description = document.getElementById('req-description').value.trim();

    if (!subject || !description) {
      return this.showToast('Please provide both subject and description.', 'warning');
    }

    try {
      const data = await this.api('/student/requests', {
        method: 'POST',
        body: JSON.stringify({ serviceType, subject, description, priority: 'MEDIUM' }),
      });

      this.showToast(`Request submitted! Ticket #${data.ticketNumber}`, 'success');
      document.getElementById('req-subject').value = '';
      document.getElementById('req-description').value = '';
      this.loadStudentData();
    } catch {}
  }

  async submitCorrectionRequest() {
    const fieldName = document.getElementById('corr-field').value;
    const oldValue = document.getElementById('corr-old').value.trim();
    const requestedValue = document.getElementById('corr-new').value.trim();
    const reason = document.getElementById('corr-reason').value.trim();

    if (!requestedValue || !reason) {
      return this.showToast('Please provide requested value and justification reason.', 'warning');
    }

    try {
      await this.api('/student/corrections', {
        method: 'POST',
        body: JSON.stringify({ fieldName, oldValue, requestedValue, reason }),
      });
      this.showToast('Data correction request submitted for official Registrar review.', 'success');
      document.getElementById('corr-new').value = '';
      document.getElementById('corr-reason').value = '';
    } catch {}
  }

  // --- Dean Batch Import Studio ---
  downloadCsvTemplate() {
    window.location.href = '/api/v1/imports/template';
  }

  loadSampleCsv() {
    const sample = [
      'student_id_number,full_name,gender,department_code,program_code,cohort_year,enrollment_status',
      'DBU/1509911,Ermias Worku Tadesse,M,COMP,BSC_SE,2024,ACTIVE',
      'DBU/1509912,Marta Kebede Wolde,F,COMP,BSC_CS,2024,ACTIVE',
      'DBU/1509913,Kassahun Haile Mengistu,M,EENG,BSC_EE,2024,ACTIVE',
    ].join('\n');
    document.getElementById('import-csv-text').value = sample;
    this.showToast('Sample senior enrollment records loaded.', 'info');
  }

  async previewImportBatch() {
    const collegeId = document.getElementById('import-college').value;
    const academicYearId = document.getElementById('import-ay').value;
    const semesterId = document.getElementById('import-sem').value;
    const csvContent = document.getElementById('import-csv-text').value.trim();

    if (!csvContent) {
      return this.showToast('Please paste or load CSV records.', 'warning');
    }

    try {
      const data = await this.api('/imports/preview', {
        method: 'POST',
        body: JSON.stringify({ collegeId, academicYearId, semesterId, csvContent }),
      });

      this.currentBatchId = data.batchId;

      document.getElementById('preview-batch-num').textContent = data.batchNumber;
      document.getElementById('badge-total-rows').textContent = `Total: ${data.totalRows}`;
      document.getElementById('badge-valid-rows').textContent = `Valid: ${data.validRows}`;
      document.getElementById('badge-invalid-rows').textContent = `Invalid: ${data.invalidRows}`;
      document.getElementById('badge-dup-rows').textContent = `Duplicates: ${data.duplicateRows}`;
      document.getElementById('badge-conflict-rows').textContent = `Conflicts: ${data.conflictRows}`;

      const tbody = document.getElementById('preview-rows-tbody');
      tbody.innerHTML = data.rows
        .map(
          (r) => `
        <tr>
          <td>${r.rowIndex}</td>
          <td><strong>${r.data.studentIdNumber}</strong></td>
          <td>${r.data.fullName}</td>
          <td>${r.data.departmentCode}</td>
          <td>${r.data.cohortYear}</td>
          <td><span class="badge ${r.isValid ? 'badge-success' : 'badge-danger'}">${r.isValid ? 'VALID' : 'INVALID'}</span></td>
          <td style="color: ${r.isValid ? 'var(--color-success)' : 'var(--color-danger)'}; font-size: 0.8rem;">
            ${r.errors.length > 0 ? r.errors.join('; ') : 'Passed validation'}
          </td>
        </tr>
      `
        )
        .join('');

      document.getElementById('import-preview-container').style.display = 'block';
      this.showToast(`Batch parsed: ${data.validRows} valid records ready for review.`, 'success');
    } catch {}
  }

  async submitCurrentBatch() {
    if (!this.currentBatchId) return;

    try {
      const data = await this.api(`/imports/${this.currentBatchId}/submit`, { method: 'POST' });
      this.showToast('Batch submitted successfully to Registrar!', 'success');
      document.getElementById('import-preview-container').style.display = 'none';
      document.getElementById('import-csv-text').value = '';
      this.loadDeanData();
    } catch {}
  }

  async loadDeanData() {
    try {
      const data = await this.api('/imports/my-batches');
      const tbody = document.getElementById('dean-batches-tbody');
      if (data.batches && data.batches.length > 0) {
        tbody.innerHTML = data.batches
          .map(
            (b) => `
          <tr>
            <td><strong>${b.batch_number}</strong></td>
            <td>${b.row_count}</td>
            <td>${b.valid_row_count}</td>
            <td><span class="badge ${b.status === 'APPROVED' ? 'badge-success' : b.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}">${b.status}</span></td>
            <td>${b.reviewer_comments || 'Pending Review'}</td>
            <td>${new Date(b.created_at).toLocaleDateString()}</td>
          </tr>
        `
          )
          .join('');
      }
    } catch {}
  }

  // --- Registrar Review Desk ---
  async loadRegistrarData() {
    this.refreshRegistrarBatches();
    this.searchRegistry();
  }

  async refreshRegistrarBatches() {
    try {
      const data = await this.api('/registrar/batches');
      const tbody = document.getElementById('reg-batches-tbody');
      if (data.batches && data.batches.length > 0) {
        tbody.innerHTML = data.batches
          .map(
            (b) => `
          <tr>
            <td><strong>${b.batch_number}</strong></td>
            <td>${b.college_name}</td>
            <td>${b.submitter_username}</td>
            <td>${b.valid_row_count}</td>
            <td><span class="badge ${b.status === 'APPROVED' ? 'badge-success' : b.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}">${b.status}</span></td>
            <td>
              ${
                ['SUBMITTED', 'UNDER_REGISTRAR_REVIEW'].includes(b.status)
                  ? `<button class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="app.openRegistrarDecisionModal('${b.id}', '${b.batch_number}')">Review & Decide</button>`
                  : `<span style="font-size: 0.8rem; color: var(--dbu-text-muted);">Decided</span>`
              }
            </td>
          </tr>
        `
          )
          .join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--dbu-text-muted);">No batches currently awaiting review.</td></tr>`;
      }
    } catch {}
  }

  async searchRegistry() {
    const search = document.getElementById('reg-search-input')?.value || '';
    try {
      const data = await this.api(`/registrar/registry?search=${encodeURIComponent(search)}`);
      const tbody = document.getElementById('reg-registry-tbody');
      if (data.records && data.records.length > 0) {
        tbody.innerHTML = data.records
          .map(
            (r) => `
          <tr>
            <td><strong>${r.student_id_number}</strong></td>
            <td>${r.full_name}</td>
            <td>${r.college_name}</td>
            <td>${r.department_name}</td>
            <td><span class="badge badge-success">Eligible</span></td>
            <td><span class="badge ${r.is_activated ? 'badge-success' : 'badge-neutral'}">${r.is_activated ? 'Activated' : 'Pending Activation'}</span></td>
            <td style="font-family: monospace; font-size: 0.75rem;">${r.source_batch_id.slice(0, 12)}...</td>
          </tr>
        `
          )
          .join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--dbu-text-muted);">No records found matching query.</td></tr>`;
      }
    } catch {}
  }

  openRegistrarDecisionModal(batchId, batchNumber) {
    this.currentReviewBatchId = batchId;
    document.getElementById('decision-batch-num').textContent = batchNumber;
    document.getElementById('reg-decision-comments').value = '';
    this.openModal('modal-reg-decision');
  }

  toggleCommentRequirement() {
    const action = document.getElementById('reg-decision-action').value;
    const commentBox = document.getElementById('reg-decision-comments');
    if (['REJECT', 'RETURN_FOR_CORRECTION'].includes(action)) {
      commentBox.placeholder = 'Mandatory justification required for this action...';
    } else {
      commentBox.placeholder = 'Optional confirmation note for Dean...';
    }
  }

  async executeRegistrarDecision() {
    if (!this.currentReviewBatchId) return;

    const action = document.getElementById('reg-decision-action').value;
    const comments = document.getElementById('reg-decision-comments').value.trim();

    if (['REJECT', 'RETURN_FOR_CORRECTION'].includes(action) && !comments) {
      return this.showToast('A mandatory review justification comment is required for this action.', 'warning');
    }

    try {
      const data = await this.api(`/registrar/batches/${this.currentReviewBatchId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ action, comments }),
      });

      this.closeModal('modal-reg-decision');
      this.showToast(data.message, 'success');
      this.refreshRegistrarBatches();
      this.searchRegistry();
    } catch {}
  }

  // --- Audit Logs ---
  async loadAuditLogs() {
    try {
      const data = await this.api('/audit/logs?limit=50');
      const tbody = document.getElementById('audit-logs-tbody');
      if (data.logs && data.logs.length > 0) {
        tbody.innerHTML = data.logs
          .map(
            (l) => `
          <tr>
            <td style="font-family: monospace; font-size: 0.8rem;">${new Date(l.created_at).toISOString().replace('T', ' ').slice(0, 19)}</td>
            <td><span class="badge badge-info">${l.actor_role}</span></td>
            <td><strong>${l.action}</strong></td>
            <td>${l.entity_type}</td>
            <td><span class="badge ${l.outcome === 'SUCCESS' ? 'badge-success' : 'badge-danger'}">${l.outcome}</span></td>
            <td style="font-family: monospace; font-size: 0.75rem; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${l.details || '{}'}
            </td>
          </tr>
        `
          )
          .join('');
      }
    } catch {}
  }

  // --- RAG AI Assistant ---
  toggleAiChat() {
    const win = document.getElementById('ai-chat-window');
    win.classList.toggle('active');
    if (win.classList.contains('active')) {
      document.getElementById('ai-user-input').focus();
    }
  }

  askAiPrompt(prompt) {
    document.getElementById('ai-user-input').value = prompt;
    this.sendAiQuery();
  }

  async sendAiQuery() {
    const input = document.getElementById('ai-user-input');
    const query = input.value.trim();
    if (!query) return;

    input.value = '';
    const msgContainer = document.getElementById('ai-messages');

    // Add user message
    const userDiv = document.createElement('div');
    userDiv.className = 'ai-msg user';
    userDiv.textContent = query;
    msgContainer.appendChild(userDiv);

    // Add loading placeholder
    const assistantDiv = document.createElement('div');
    assistantDiv.className = 'ai-msg assistant';
    assistantDiv.innerHTML = '<em>Searching verified DBU knowledge sources...</em>';
    msgContainer.appendChild(assistantDiv);
    msgContainer.scrollTop = msgContainer.scrollHeight;

    try {
      const data = await this.api('/ai/query', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });

      let citationsHtml = '';
      if (data.citations && data.citations.length > 0) {
        citationsHtml = data.citations
          .map(
            (c) => `
          <div class="ai-citation-box">
            📄 <strong>Source:</strong> ${c.documentTitle} (v${c.versionLabel})<br>
            📌 <strong>Section:</strong> ${c.sectionTitle}<br>
            🔒 <strong>Scope:</strong> ${c.accessScope}
          </div>
        `
          )
          .join('');
      }

      const formattedAnswer = data.answer.replace(/\n/g, '<br>');
      assistantDiv.innerHTML = `
        ${data.abstained ? '<div class="badge badge-warning" style="margin-bottom: 0.5rem;">Official Abstention Notice</div><br>' : ''}
        ${formattedAnswer}
        ${citationsHtml}
      `;
    } catch (err) {
      assistantDiv.innerHTML = `<span style="color: var(--color-danger);">Error querying assistant: ${err.message}</span>`;
    }

    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  // --- Public Announcements ---
  async loadPublicAnnouncements() {
    try {
      const data = await this.api('/announcements');
      // Already populated with high-quality defaults; can augment dynamically
    } catch {}
  }

  // --- Modals & Toasts ---
  openModal(id) {
    document.getElementById(id)?.classList.add('active');
  }

  closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
  }

  openLoginModal() {
    this.openModal('modal-login');
  }

  openForgotPasswordModal() {
    this.closeModal('modal-login');
    document.getElementById('forgot-step-1').style.display = 'block';
    document.getElementById('forgot-step-2').style.display = 'none';
    const input = document.getElementById('forgot-identifier');
    if (input) input.value = '';
    this.openModal('modal-forgot-password');
  }

  async requestPasswordReset() {
    const identifier = document.getElementById('forgot-identifier')?.value.trim();
    if (!identifier) {
      return this.showToast('Please provide your username or registered email.', 'warning');
    }

    try {
      const data = await this.api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });

      this.showToast(data.message || 'Recovery instructions dispatched.', 'success');
      document.getElementById('forgot-step-1').style.display = 'none';
      document.getElementById('forgot-step-2').style.display = 'block';
      if (data.resetToken) {
        document.getElementById('reset-token-input').value = data.resetToken;
      }
    } catch {
      // Error handled in api()
    }
  }

  async completePasswordReset() {
    const token = document.getElementById('reset-token-input')?.value.trim();
    const password = document.getElementById('reset-new-password')?.value;

    if (!token || !password) {
      return this.showToast('Please enter both the recovery token and new password.', 'warning');
    }

    if (password.length < 8) {
      return this.showToast('Password must be at least 8 characters.', 'warning');
    }

    try {
      const data = await this.api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      this.showToast(data.message || 'Password reset successfully!', 'success');
      this.closeModal('modal-forgot-password');
      this.openLoginModal();
    } catch {
      // Error handled in api()
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderLeft = `4px solid ${type === 'success' ? '#10b981' : type === 'danger' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// Instantiate Global App
const app = new MeriApp();
window.app = app;
