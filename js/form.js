/**
 * ClinicFlow AI - Web Booking Form
 * Single BASE_URL - change only this when going live
 */

const BASE_URL = 'https://demoAPI.com/api/';

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

  const ERROR_ID_MAP = {
    patient_name: 'error-name',
    phone: 'error-phone',
    email: 'error-email',
    preferred_date: 'error-date',
    preferred_time: 'error-time',
  };

  function getClinicIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const clinicId = params.get('clinic_id');
    if (clinicId === null || clinicId === '') return null;
    const parsed = parseInt(clinicId, 10);
    return Number.isNaN(parsed) ? null : parsed;
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
    toast.innerHTML = iconSvg + '<span>' + message + '</span>';
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

  async function fetchDoctors() {
    const clinicId = getClinicIdFromUrl();
    if (clinicId === null) return;

    try {
      const response = await fetch(BASE_URL + 'getDoctors.php?clinic_id=' + clinicId);
      if (!response.ok) return;
      const doctors = await response.json();
      if (Array.isArray(doctors) && doctorSelect) {
        doctors.forEach(function (d) {
          const opt = document.createElement('option');
          opt.value = d.name || d;
          opt.textContent = d.name || d;
          doctorSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Could not fetch doctors:', err);
    }
  }

  function validateForm() {
    const errors = {};
    const name = form?.querySelector('#patient_name');
    const phone = form?.querySelector('#phone');
    const email = form?.querySelector('#email');
    const date = form?.querySelector('#preferred_date');
    const time = form?.querySelector('#preferred_time');

    if (!name?.value.trim()) {
      errors.patient_name = 'This field is required';
    }

    if (!phone?.value.trim()) {
      errors.phone = 'This field is required';
    } else if (!/^[\d\s\-+()]{8,}$/.test(phone.value.replace(/\s/g, ''))) {
      errors.phone = 'Please enter a valid phone number';
    }

    if (email?.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!date?.value) {
      errors.preferred_date = 'This field is required';
    }

    if (!time?.value) {
      errors.preferred_time = 'This field is required';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  function buildPayload() {
    const clinicId = getClinicIdFromUrl();
    const dateEl = form?.querySelector('#preferred_date');
    const timeEl = form?.querySelector('#preferred_time');
    const countryCode = form?.querySelector('#phone_country_code')?.value || '';
    const phoneNumber = form?.querySelector('#phone')?.value?.trim() || '';

    const dateStr = dateEl?.value || '';
    const timeStr = timeEl?.value || '00:00:00';
    const appointmentDate = dateStr && timeStr
      ? dateStr + ' ' + timeStr + ':00'
      : '';

    const phone = phoneNumber ? (countryCode + phoneNumber.replace(/\s/g, '')) : '';

    const payload = {
      clinic_id: clinicId ?? 0,
      patient_name: form?.querySelector('#patient_name')?.value?.trim() || '',
      phone,
      appointment_date: appointmentDate,
    };

    const email = form?.querySelector('#email')?.value?.trim();
    if (email) payload.email = email;

    const doctorName = form?.querySelector('#doctor_name')?.value?.trim();
    if (doctorName) payload.doctor_name = doctorName;

    const notes = form?.querySelector('#notes')?.value?.trim();
    if (notes) payload.notes = notes;

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
      const msg = 'Please fill in all required fields (Name, Phone, Date, Time).';
      showFormMessage(msg);
      showToast(msg);
      if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstErrorEl.focus();
      }
      return;
    }

    const clinicId = getClinicIdFromUrl();
    if (clinicId === null) {
      const msg = 'Invalid or missing clinic ID. Please scan the clinic QR code to book.';
      showFormMessage(msg);
      showToast(msg);
      return;
    }

    clearAllFieldErrors();
    hideFormMessage();
    setLoading(true);

    const payload = buildPayload();

    try {
      const response = await fetch(BASE_URL + 'createAppointment.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(function () {
        return null;
      });

      if (response.ok && data && data.success === true) {
        successOverlay.hidden = false;
        const successMsg = 'Your appointment has been booked successfully. The clinic will confirm your appointment shortly. Thank you!';
        showToast(successMsg, 'success');
        form?.reset();
        if (doctorSelect) {
          doctorSelect.innerHTML = '<option value="">Select doctor (optional)</option>';
          fetchDoctors();
        }
        form?.querySelector('#phone_country_code').value = '+971';
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

  successOverlay?.addEventListener('click', (e) => {
    if (e.target === successOverlay) {
      successOverlay.hidden = true;
    }
  });

  document.getElementById('success-done-btn')?.addEventListener('click', () => {
    successOverlay.hidden = true;
  });

  const dateInput = form?.querySelector('#preferred_date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
  }

  fetchDoctors();
});
