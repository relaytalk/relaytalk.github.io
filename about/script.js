/* ============================================================ */
/* RelayTalk — About page                                        */
/* Tabs, deep-linking via hash, smooth UX                        */
/* ============================================================ */

(function () {
    'use strict';

    var TABS = ['details', 'features', 'claims', 'help'];
    var DEFAULT_TAB = 'details';

    var tabButtons = document.querySelectorAll('.about-tab');
    var sections   = document.querySelectorAll('.about-section');

    /* -------------------------------------------------------- */
    /* Activate a section by id                                  */
    /* -------------------------------------------------------- */
    function activate(id, opts) {
        opts = opts || {};

        if (TABS.indexOf(id) === -1) id = DEFAULT_TAB;

        // Buttons
        tabButtons.forEach(function (btn) {
            var isActive = btn.getAttribute('data-target') === id;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        // Sections
        sections.forEach(function (sec) {
            var isActive = sec.id === id;
            sec.classList.toggle('active', isActive);
        });

        // Deep link
        if (!opts.skipHash) {
            var hash = '#' + id;
            if (window.location.hash !== hash) {
                try {
                    history.replaceState(null, '', hash);
                } catch (e) {
                    window.location.hash = id;
                }
            }
        }

        // Scroll tab into view (mobile)
        var activeBtn = document.querySelector('.about-tab.active');
        if (activeBtn && opts.scrollTab) {
            activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }

        // Scroll top of content into view (skip on first load)
        if (opts.scrollToContent) {
            var target = document.getElementById(id);
            if (target) {
                var y = target.getBoundingClientRect().top + window.pageYOffset - 90;
                window.scrollTo({ top: Math.max(y, 0), behavior: 'smooth' });
            }
        }
    }

    /* -------------------------------------------------------- */
    /* Click handlers                                            */
    /* -------------------------------------------------------- */
    tabButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-target');
            activate(id, { scrollTab: true, scrollToContent: true });
        });
    });

    /* -------------------------------------------------------- */
    /* Handle hash on load + when it changes                     */
    /* -------------------------------------------------------- */
    function fromHash() {
        var raw = (window.location.hash || '').replace('#', '').trim();
        return TABS.indexOf(raw) !== -1 ? raw : DEFAULT_TAB;
    }

    window.addEventListener('hashchange', function () {
        activate(fromHash(), { scrollToContent: false });
    });

    /* -------------------------------------------------------- */
    /* Handle clicks on links pointing to #section               */
    /* (e.g. coming from the root footer)                        */
    /* -------------------------------------------------------- */
    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a) return;

        var id = a.getAttribute('href').replace('#', '');
        if (TABS.indexOf(id) === -1) return;

        e.preventDefault();
        activate(id, { scrollTab: true, scrollToContent: true });
    });

    /* -------------------------------------------------------- */
    /* Init                                                      */
    /* -------------------------------------------------------- */
    document.addEventListener('DOMContentLoaded', function () {
        activate(fromHash(), { skipHash: true });
    });

    // In case DOMContentLoaded already fired
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        activate(fromHash(), { skipHash: true });
    }
})();