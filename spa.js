import { startRouter } from './spa/router.js';

document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('footer-year');
  if (year) year.textContent = new Date().getFullYear();

  startRouter();
});
