/**
 * ClinicFlow — public web booking form
 * Single API_BASE_URL (trailing slash); change only this per environment.
 */

const API_BASE_URL = 'https://demoAPI.com/api/';

/**
 * Local preview only (localhost, 127.0.0.1, or file://): used when the URL has no clinic_id.
 * Production sites on a real hostname still require ?clinic_id= or /book/{id}. Change 12 to your test clinic.
 * Set to null if you always want the query param, even locally.
 */
const LOCAL_DEV_FALLBACK_CLINIC_ID = 12;

/** Optional: appointment length for doctor overlap UX (align with backend, often 30). */
const APPOINTMENT_DURATION_MINUTES = 30;

function apiUrl(path) {
  return API_BASE_URL + String(path).replace(/^\//, '');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function getClinicIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('clinic_id');
  if (q !== null && q !== '') {
    const parsed = parseInt(q, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const path = window.location.pathname.replace(/\/$/, '');
  const m = path.match(/\/book\/(\d+)$/i);
  if (m) {
    const parsed = parseInt(m[1], 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function isLocalBookingContext() {
  if (window.location.protocol === 'file:') return true;
  const h = window.location.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '0.0.0.0') return true;
  const parts = h.split('.');
  if (parts.length === 4) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function getEffectiveClinicId() {
  const fromUrl = getClinicIdFromUrl();
  if (fromUrl !== null) return fromUrl;
  if (
    isLocalBookingContext() &&
    LOCAL_DEV_FALLBACK_CLINIC_ID != null &&
    typeof LOCAL_DEV_FALLBACK_CLINIC_ID === 'number' &&
    !Number.isNaN(LOCAL_DEV_FALLBACK_CLINIC_ID)
  ) {
    return LOCAL_DEV_FALLBACK_CLINIC_ID;
  }
  return null;
}

function getBookingTokenFromUrl() {
  const t = new URLSearchParams(window.location.search).get('token');
  return t && t.trim() ? t.trim() : '';
}

function withTokenQuery(url) {
  const token = getBookingTokenFromUrl();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'token=' + encodeURIComponent(token);
}

/** Parse "8:00 AM" / "9:00 PM" or "08:00" / "21:00" → minutes from midnight */
function parseTimeToMinutes(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  const twelve = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelve) {
    let h = parseInt(twelve[1], 10);
    const m = parseInt(twelve[2], 10);
    const ap = twelve[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  const tf = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (tf) {
    const h = parseInt(tf[1], 10);
    const m = parseInt(tf[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m;
  }
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Minutes from midnight → "HH:mm:ss" */
function minutesToTimeHHMMSS(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return pad2(h) + ':' + pad2(m) + ':00';
}

function formatTimeLabel(hh, mm) {
  const h24 = hh;
  const ap = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return h12 + ':' + pad2(mm) + ' ' + ap;
}

/** "yyyy-MM-dd HH:mm:ss" or "yyyy-MM-dd HH:mm" → epoch ms (local interpretation) */
function parseAppointmentLocal(appointmentDateStr) {
  const m = appointmentDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return NaN;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const hh = parseInt(m[4], 10);
  const mm = parseInt(m[5], 10);
  const ss = m[6] !== undefined ? parseInt(m[6], 10) : 0;
  return new Date(y, mo, d, hh, mm, ss).getTime();
}

function normalizeAppointmentKey(str) {
  if (!str || typeof str !== 'string') return '';
  const s = str.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return s;
  const sec = m[4] !== undefined ? pad2(parseInt(m[4], 10)) : '00';
  return m[1] + ' ' + m[2] + ':' + m[3] + ':' + sec;
}

function isCancelledStatus(status) {
  return String(status || '').trim().toLowerCase() === 'cancelled';
}

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  const form = document.getElementById('booking-form');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn?.querySelector('.booking-btn-text');
  const btnIcon = submitBtn?.querySelector('.booking-btn-icon');
  const btnLoading = submitBtn?.querySelector('.booking-btn-loading');
  const formMessage = document.getElementById('form-message');
  const successOverlay = document.getElementById('success-overlay');
  const doctorSelect = document.getElementById('doctor_name');
  const timeSelect = document.getElementById('preferred_time');
  const dateInput = form?.querySelector('#preferred_date');
  const clinicHidden = document.getElementById('clinic_id');
  const headerSub = document.getElementById('booking-header-sub');

  let bookingMeta = {
    clinic_name: null,
    working_hours_open: '8:00 AM',
    working_hours_close: '9:00 PM',
    slot_interval_minutes: 15,
    max_bookings_per_slot: 2,
  };

  let appointmentsForDate = [];

  const ERROR_ID_MAP = {
    patient_name: 'error-name',
    phone: 'error-phone',
    preferred_date: 'error-date',
    preferred_time: 'error-time',
    doctor_name: 'error-doctor',
  };

  const clinicId = getEffectiveClinicId();
  const clinicIdFromUrl = getClinicIdFromUrl();

  function syncClinicHidden() {
    if (clinicHidden && clinicId !== null) {
      clinicHidden.value = String(clinicId);
    }
  }

  function showFormMessage(text, type = 'error') {
    if (!formMessage) return;
    formMessage.textContent = text;
    formMessage.className = `booking-message booking-message--${type}`;
    formMessage.removeAttribute('hidden');
  }

  function hideFormMessage() {
    if (!formMessage) return;
    formMessage.textContent = '';
    formMessage.setAttribute('hidden', '');
  }

  function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    const iconSvg = type === 'error'
      ? '<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
      : '<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';
    toast.innerHTML = iconSvg + '<span>' + escapeHtml(message) + '</span>';
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-0.5rem)';
      toast.style.transition = 'opacity 0.2s, transform 0.2s';
      setTimeout(function () {
        toast.remove();
      }, 200);
    }, 4000);
  }

  function setFieldError(el, message) {
    if (!el) return;
    el.classList.add('booking-input--error');
    el.setAttribute('aria-invalid', 'true');
    const errorId = ERROR_ID_MAP[el.name] || `error-${el.name}`;
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = message;
    }
  }

  function clearFieldError(el) {
    if (!el) return;
    el.classList.remove('booking-input--error');
    el.removeAttribute('aria-invalid');
    const errorId = ERROR_ID_MAP[el.name] || `error-${el.name}`;
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = '';
    }
  }

  function clearAllFieldErrors() {
    form?.querySelectorAll('.booking-input--error').forEach((el) => {
      el.classList.remove('booking-input--error');
    });
    form?.querySelectorAll('[id^="error-"]').forEach((el) => {
      el.textContent = '';
    });
  }

  function setLoading(loading) {
    if (!submitBtn || !btnText || !btnIcon || !btnLoading) return;
    submitBtn.disabled = loading;
    btnText.hidden = loading;
    btnIcon.hidden = loading;
    btnLoading.hidden = !loading;
  }

  function getOpenCloseMinutes() {
    const openM = parseTimeToMinutes(bookingMeta.working_hours_open) ?? 8 * 60;
    const closeM = parseTimeToMinutes(bookingMeta.working_hours_close) ?? 21 * 60;
    if (closeM <= openM) {
      return { openM: 8 * 60, closeM: 21 * 60 };
    }
    return { openM, closeM };
  }

  function getSlotStepMinutes() {
    const s = Number(bookingMeta.slot_interval_minutes) || 15;
    return s > 0 ? s : 15;
  }

  function getMaxPerSlot() {
    const m = Number(bookingMeta.max_bookings_per_slot);
    return m > 0 ? m : 2;
  }

  function countAtSlotStart(fullDateTime) {
    const key = normalizeAppointmentKey(fullDateTime);
    let n = 0;
    appointmentsForDate.forEach(function (a) {
      if (isCancelledStatus(a.status)) return;
      if (normalizeAppointmentKey(a.appointment_date) === key) n += 1;
    });
    return n;
  }

  function doctorSlotBlocked(doctorName, slotDateTimeStr) {
    if (!doctorName) return false;
    const slotStart = parseAppointmentLocal(slotDateTimeStr);
    if (Number.isNaN(slotStart)) return false;
    const slotEnd = slotStart + APPOINTMENT_DURATION_MINUTES * 60000;
    let blocked = false;
    appointmentsForDate.forEach(function (a) {
      if (blocked) return;
      if (isCancelledStatus(a.status)) return;
      const dn = String(a.doctor_name || '').trim();
      if (dn !== doctorName) return;
      const aStart = parseAppointmentLocal(a.appointment_date);
      if (Number.isNaN(aStart)) return;
      const aEnd = aStart + APPOINTMENT_DURATION_MINUTES * 60000;
      if (slotStart < aEnd && slotEnd > aStart) blocked = true;
    });
    return blocked;
  }

  function isSlotPast(dateStr, timeHHMMSS) {
    const full = dateStr + ' ' + timeHHMMSS;
    const t = parseAppointmentLocal(full);
    return !Number.isNaN(t) && t < Date.now();
  }

  function rebuildTimeOptions() {
    if (!timeSelect) return;
    const dateStr = dateInput?.value || '';
    const prev = timeSelect.value;
    timeSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    if (!dateStr) {
      placeholder.textContent = 'Select a date first';
      timeSelect.appendChild(placeholder);
      return;
    }

    placeholder.textContent = 'Select a time';
    timeSelect.appendChild(placeholder);

    const { openM, closeM } = getOpenCloseMinutes();
    const step = getSlotStepMinutes();
    const maxPer = getMaxPerSlot();
    const doctorName = doctorSelect?.value?.trim() || '';

    for (let m = openM; m < closeM; m += step) {
      const timePart = minutesToTimeHHMMSS(m);
      const fullDt = dateStr + ' ' + timePart;
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      const label = formatTimeLabel(hh, mm);

      const atCap = countAtSlotStart(fullDt) >= maxPer;
      const docBlock = doctorSlotBlocked(doctorName, fullDt);
      const past = isSlotPast(dateStr, timePart);
      const disabled = atCap || docBlock || past;

      const opt = document.createElement('option');
      opt.value = timePart;
      opt.textContent = label + (atCap ? ' (full)' : '') + (docBlock ? ' (unavailable)' : '') + (past ? ' (past)' : '');
      if (disabled) opt.disabled = true;
      timeSelect.appendChild(opt);
    }

    if (prev) {
      const matchOpt = Array.from(timeSelect.options).find(function (o) {
        return o.value === prev && !o.disabled;
      });
      if (matchOpt) timeSelect.value = prev;
    }
  }

  async function fetchBookingInfo() {
    if (clinicId === null) return;
    const url = withTokenQuery(apiUrl('getPublicClinicBookingInfo.php') + '?clinic_id=' + encodeURIComponent(String(clinicId)));
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();
      if (data && typeof data === 'object') {
        if (data.clinic_name) bookingMeta.clinic_name = data.clinic_name;
        if (data.working_hours_open) bookingMeta.working_hours_open = data.working_hours_open;
        if (data.working_hours_close) bookingMeta.working_hours_close = data.working_hours_close;
        if (data.slot_interval_minutes != null) bookingMeta.slot_interval_minutes = data.slot_interval_minutes;
        if (data.max_bookings_per_slot != null) bookingMeta.max_bookings_per_slot = data.max_bookings_per_slot;
      }
      if (headerSub && bookingMeta.clinic_name) {
        headerSub.innerHTML =
          '<strong>' + escapeHtml(bookingMeta.clinic_name) + '</strong><br><span style="font-weight:400">' +
          escapeHtml('So our team can reach out to you on time') + '</span>';
      }
    } catch (err) {
      console.warn('getPublicClinicBookingInfo unavailable, using defaults:', err);
    }
  }

  async function fetchAppointmentsForDate(dateStr) {
    appointmentsForDate = [];
    if (clinicId === null || !dateStr) {
      rebuildTimeOptions();
      return;
    }
    const url = withTokenQuery(
      apiUrl('getPublicAppointmentsForDate.php') +
        '?clinic_id=' + encodeURIComponent(String(clinicId)) +
        '&date=' + encodeURIComponent(dateStr)
    );
    try {
      const response = await fetch(url);
      if (!response.ok) {
        rebuildTimeOptions();
        return;
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        appointmentsForDate = data;
      }
    } catch (err) {
      console.warn('getPublicAppointmentsForDate unavailable:', err);
    }
    rebuildTimeOptions();
  }

  async function fetchDoctors() {
    if (clinicId === null) return;

    try {
      const url = withTokenQuery(apiUrl('getDoctors.php') + '?clinic_id=' + encodeURIComponent(String(clinicId)));
      const response = await fetch(url);
      if (!response.ok) return;
      const doctors = await response.json();
      if (!Array.isArray(doctors) || !doctorSelect) return;

      doctorSelect.innerHTML = '<option value="">Select a doctor</option>';
      doctors.forEach(function (d) {
        if (typeof d === 'object' && d !== null) {
          if (d.clinic_id != null && Number(d.clinic_id) !== Number(clinicId)) return;
          const name = d.name;
          if (!name) return;
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          doctorSelect.appendChild(opt);
        } else if (typeof d === 'string' && d) {
          const opt = document.createElement('option');
          opt.value = d;
          opt.textContent = d;
          doctorSelect.appendChild(opt);
        }
      });
    } catch (err) {
      console.warn('Could not fetch doctors:', err);
    }
  }

  function validateForm() {
    const errors = {};
    const name = form?.querySelector('#patient_name');
    const phone = form?.querySelector('#phone');
    const date = form?.querySelector('#preferred_date');
    const time = form?.querySelector('#preferred_time');

    const rawName = name?.value.trim() || '';
    if (!rawName) {
      errors.patient_name = 'This field is required';
    } else if (rawName.length > 120) {
      errors.patient_name = 'Name must be at most 120 characters';
    }

    if (!phone?.value.trim()) {
      errors.phone = 'This field is required';
    } else if (!/^[\d\s\-+()]{8,}$/.test(phone.value.replace(/\s/g, ''))) {
      errors.phone = 'Please enter a valid phone number';
    }

    if (!date?.value) {
      errors.preferred_date = 'This field is required';
    }

    if (!doctorSelect?.value?.trim()) {
      errors.doctor_name = 'Please select a doctor';
    }

    if (!time?.value) {
      errors.preferred_time = 'Please select a time';
    } else {
      const parts = time.value.split(':');
      const mins = parseInt(parts[1], 10);
      if (parts.length < 2 || (mins % getSlotStepMinutes() !== 0)) {
        errors.preferred_time = 'Time must align to a ' + getSlotStepMinutes() + '-minute slot';
      }
      const dateStr = date?.value || '';
      if (dateStr && isSlotPast(dateStr, time.value.length === 5 ? time.value + ':00' : time.value)) {
        errors.preferred_time = 'This time is in the past';
      }
      const fullDt = dateStr + ' ' + (time.value.length === 5 ? time.value + ':00' : time.value);
      if (countAtSlotStart(fullDt) >= getMaxPerSlot()) {
        errors.preferred_time = 'This slot is full. Choose another time.';
      }
      const doc = doctorSelect?.value?.trim() || '';
      if (doc && doctorSlotBlocked(doc, fullDt)) {
        errors.preferred_time = 'This doctor is not available at this time.';
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  function buildPayload() {
    const dateEl = form?.querySelector('#preferred_date');
    const timeEl = form?.querySelector('#preferred_time');
    const countryCode = form?.querySelector('#phone_country_code')?.value || '';
    const phoneNumber = form?.querySelector('#phone')?.value?.trim() || '';

    const dateStr = dateEl?.value || '';
    let timeStr = timeEl?.value || '';
    if (timeStr && timeStr.split(':').length === 2) {
      timeStr = timeStr + ':00';
    }
    const appointmentDate = dateStr && timeStr ? dateStr + ' ' + timeStr : '';

    const phone = phoneNumber ? (countryCode + phoneNumber.replace(/\s/g, '')) : '';

    const payload = {
      clinic_id: clinicId,
      patient_name: form?.querySelector('#patient_name')?.value?.trim() || '',
      phone,
      appointment_date: appointmentDate,
    };

    const doctorName = form?.querySelector('#doctor_name')?.value?.trim() || '';
    payload.doctor_name = doctorName;

    const notes = form?.querySelector('#notes')?.value?.trim();
    if (notes) payload.notes = notes;

    const token = getBookingTokenFromUrl();
    if (token) payload.booking_token = token;

    return payload;
  }

  async function submitForm() {
    const { valid, errors } = validateForm();
    if (!valid) {
      clearAllFieldErrors();
      let firstErrorEl = null;
      Object.entries(errors).forEach(([field, message]) => {
        const el = form?.querySelector(`[name="${field}"]`);
        if (el) {
          setFieldError(el, message);
          if (!firstErrorEl) firstErrorEl = el;
        }
      });
      const msg = 'Please correct the highlighted fields.';
      showFormMessage(msg);
      showToast(msg);
      if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstErrorEl.focus();
      }
      return;
    }

    if (clinicId === null) {
      const msg = 'Invalid or missing clinic ID. Please use the clinic booking link or QR code.';
      showFormMessage(msg);
      showToast(msg);
      return;
    }

    clearAllFieldErrors();
    hideFormMessage();
    setLoading(true);

    const payload = buildPayload();

    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      const response = await fetch(apiUrl('createAppointment.php'), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      let data = null;
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = null;
        }
      }

      const explicitFail = data && data.success === false;
      if (response.ok && !explicitFail) {
        successOverlay.hidden = false;
        const successMsg = 'Your appointment has been booked successfully. The clinic will confirm your appointment shortly. Thank you!';
        showToast(successMsg, 'success');
        form?.reset();
        syncClinicHidden();
        if (doctorSelect) {
          doctorSelect.innerHTML = '<option value="">Select a doctor</option>';
          fetchDoctors();
        }
        const cc = form?.querySelector('#phone_country_code');
        if (cc) cc.value = '+971';
        if (dateInput) {
          const today = new Date().toISOString().split('T')[0];
          dateInput.setAttribute('min', today);
        }
        rebuildTimeOptions();
        await fetchAppointmentsForDate(dateInput?.value || '');
      } else {
        const errMsg = (data && (data.message || data.error)) ? (data.message || data.error) : 'Something went wrong. Please try again.';
        showFormMessage(errMsg, 'error');
        showToast(errMsg, 'error');
      }
    } catch (err) {
      console.error('ClinicFlow booking error:', err);
      const errMsg = 'Unable to connect. Please check your connection and try again.';
      showFormMessage(errMsg, 'error');
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  }

  submitBtn?.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    submitForm();
    return false;
  });

  form?.addEventListener('submit', function (e) {
    e.preventDefault();
    e.stopPropagation();
    submitForm();
    return false;
  });

  form?.addEventListener('input', (e) => {
    const target = e.target;
    if (target.matches('.booking-input')) {
      clearFieldError(target);
    }
  });

  form?.addEventListener('change', (e) => {
    const target = e.target;
    if (target.id === 'phone_country_code') {
      clearFieldError(form?.querySelector('#phone'));
    } else if (target.matches('.booking-input')) {
      clearFieldError(target);
    }
  });

  doctorSelect?.addEventListener('change', () => {
    rebuildTimeOptions();
  });

  dateInput?.addEventListener('change', () => {
    const v = dateInput.value;
    fetchAppointmentsForDate(v);
  });

  successOverlay?.addEventListener('click', (e) => {
    if (e.target === successOverlay) {
      successOverlay.hidden = true;
    }
  });

  document.getElementById('success-done-btn')?.addEventListener('click', () => {
    successOverlay.hidden = true;
  });

  syncClinicHidden();

  if (clinicId === null) {
    showFormMessage('Invalid or missing clinic ID. Open this page from your clinic link (e.g. ?clinic_id=12 or /book/12).', 'error');
    if (submitBtn) submitBtn.disabled = true;
  } else {
    if (clinicIdFromUrl === null && isLocalBookingContext() && LOCAL_DEV_FALLBACK_CLINIC_ID != null) {
      showFormMessage(
        'Local preview: using clinic_id ' +
          LOCAL_DEV_FALLBACK_CLINIC_ID +
          '. For production, use your clinic link with ?clinic_id= or /book/{id}.',
        'info'
      );
    }
    const today = new Date().toISOString().split('T')[0];
    if (dateInput) dateInput.setAttribute('min', today);

    Promise.all([fetchBookingInfo(), fetchDoctors()]).then(function () {
      rebuildTimeOptions();
      if (dateInput?.value) {
        fetchAppointmentsForDate(dateInput.value);
      }
    });
  }
});
