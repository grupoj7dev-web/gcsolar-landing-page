/**
 * script.js - GCredito Landing Page Interactions
 */

document.addEventListener('DOMContentLoaded', () => {

    /* -----------------------------------------------------------
       Theme Toggling Setup
       ----------------------------------------------------------- */
    const themeToggle = document.getElementById('themeToggle');
    const htmlElement = document.documentElement;
    const themeIcon = themeToggle.querySelector('i');

    // Check local storage for theme preference, default to dark
    const currentTheme = localStorage.getItem('theme') || 'dark';
    htmlElement.setAttribute('data-theme', currentTheme);
    updateThemeIcon(currentTheme);

    themeToggle.addEventListener('click', () => {
        const newTheme = htmlElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });

    // Mobile Menu Toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = mobileMenuBtn.querySelector('i');
            if (navLinks.classList.contains('active')) {
                icon.classList.remove('ph-list');
                icon.classList.add('ph-x'); // Change to close icon
            } else {
                icon.classList.remove('ph-x');
                icon.classList.add('ph-list'); // Change back to hamburger
            }
        });

        // Close menu when clicking a link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                const icon = mobileMenuBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('ph-x');
                    icon.classList.add('ph-list');
                }
            });
        });
    }

    function updateThemeIcon(theme) {
        const logo = document.getElementById('mainLogo');
        if (theme === 'dark') {
            themeIcon.classList.remove('ph-moon');
            themeIcon.classList.add('ph-sun');
            if (logo) logo.src = 'logo6.png';
        } else {
            themeIcon.classList.remove('ph-sun');
            themeIcon.classList.add('ph-moon');
            if (logo) logo.src = 'logo6.png';
        }
    }

    /* -----------------------------------------------------------
       Custom Cursor (Desktop Only)
       ----------------------------------------------------------- */
    const isDesktop = window.matchMedia('(min-width: 1025px)').matches;

    if (isDesktop) {
        const cursorDot = document.querySelector('.cursor-dot');
        const cursorOutline = document.querySelector('.cursor-outline');

        window.addEventListener('mousemove', (e) => {
            const posX = e.clientX;
            const posY = e.clientY;

            // Immediately move the dot
            cursorDot.style.left = `${posX}px`;
            cursorDot.style.top = `${posY}px`;

            // Add slight delay with animation for outine
            cursorOutline.animate({
                left: `${posX}px`,
                top: `${posY}px`
            }, { duration: 500, fill: "forwards" });
        });

        // Hover Effect on clickable elements
        const clickables = document.querySelectorAll('a, button, .accordion-header, .card, .feature-card');

        clickables.forEach(el => {
            el.addEventListener('mouseenter', () => {
                cursorOutline.style.transform = 'translate(-50%, -50%) scale(1.5)';
                cursorOutline.style.backgroundColor = 'rgba(21, 128, 61, 0.1)';
            });
            el.addEventListener('mouseleave', () => {
                cursorOutline.style.transform = 'translate(-50%, -50%) scale(1)';
                cursorOutline.style.backgroundColor = 'transparent';
            });
        });
    }


    /* -----------------------------------------------------------
       Scroll Reveal Animations
       ----------------------------------------------------------- */
    const revealElements = document.querySelectorAll('.reveal');

    const revealOptions = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const revealOnScroll = new IntersectionObserver(function (entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // Reveal only once
            }
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealOnScroll.observe(el);
    });

    /* -----------------------------------------------------------
       Navbar Sticky & Style Change on Scroll
       ----------------------------------------------------------- */
    const navbar = document.querySelector('.navbar');
    const backToTop = document.getElementById('backToTop');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.padding = '0';
            navbar.style.boxShadow = 'var(--shadow-md)';
        } else {
            navbar.style.padding = '10px 0';
            navbar.style.boxShadow = 'none';
        }

        // Back to top button visibility
        if (window.scrollY > 500) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    });

    // Trigger scroll initially to set correct state
    window.dispatchEvent(new Event('scroll'));

    /* -----------------------------------------------------------
       Parallax Effect for Hero Image
       ----------------------------------------------------------- */
    const parallaxElements = document.querySelectorAll('.parallax');

    window.addEventListener('scroll', () => {
        let scrollY = window.scrollY;

        parallaxElements.forEach(el => {
            // Slight translation based on scroll position
            // Only perform if element is near viewport (for performance)
            if (scrollY < window.innerHeight * 1.5) {
                el.style.transform = `translateY(${scrollY * 0.15}px)`;
            }
        });
    });

    /* -----------------------------------------------------------
       FAQ Accordion
       ----------------------------------------------------------- */
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            // Close others
            accordionHeaders.forEach(otherH => {
                if (otherH !== header) {
                    otherH.classList.remove('active');
                    otherH.nextElementSibling.style.maxHeight = null;
                }
            });

            // Toggle current
            header.classList.toggle('active');
            const content = header.nextElementSibling;

            if (header.classList.contains('active')) {
                content.style.maxHeight = content.scrollHeight + "px";
            } else {
                content.style.maxHeight = null;
            }
        });
    });

    /* -----------------------------------------------------------
       Smooth Scrolling for Anchor Links
       ----------------------------------------------------------- */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');

            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - navHeight;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
            }
        });
    });

    /* -----------------------------------------------------------
       Scroll Progress Bar
       ----------------------------------------------------------- */
    const scrollProgress = document.getElementById('scrollProgress');
    window.addEventListener('scroll', () => {
        const totalScroll = document.documentElement.scrollTop;
        const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scroll = `${totalScroll / windowHeight * 100}%`;
        if (scrollProgress) scrollProgress.style.width = scroll;
    });

    /* -----------------------------------------------------------
       Animated Counters
       ----------------------------------------------------------- */
    const counters = document.querySelectorAll('.counter');
    const counterOptions = { threshold: 0.5 };
    const counterObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const countTo = parseInt(target.getAttribute('data-target'));
                const duration = 2000; // 2 seconds
                const frameDuration = 1000 / 60;
                const totalFrames = Math.round(duration / frameDuration);
                let frame = 0;

                const counterFn = setInterval(() => {
                    frame++;
                    const progress = frame / totalFrames;
                    const currentCount = Math.round(countTo * progress);
                    target.innerText = currentCount;

                    if (frame === totalFrames) {
                        clearInterval(counterFn);
                        target.innerText = countTo;
                    }
                }, frameDuration);

                observer.unobserve(target);
            }
        });
    }, counterOptions);

    counters.forEach(counter => {
        counterObserver.observe(counter);
    });

    /* -----------------------------------------------------------
       3D Tilt Effect on Cards
       ----------------------------------------------------------- */
    const tiltCards = document.querySelectorAll('.card, .feature-card, .pricing-card');
    tiltCards.forEach(card => {
        if (!isDesktop) return; // Only on desktop

        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left; // x position within the element
            const y = e.clientY - rect.top;  // y position within the element

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = ((y - centerY) / centerY) * -10; // Max 10 deg
            const rotateY = ((x - centerX) / centerX) * 10;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
            // Wait 0.3s then remove inline transform to let CSS empty state take over
            setTimeout(() => {
                card.style.transform = '';
            }, 300);
        });
    });

    /* -----------------------------------------------------------
       Energy Particles Generator
       ----------------------------------------------------------- */
    const particlesContainer = document.getElementById('particles');
    if (particlesContainer) {
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');

            // Random properties
            const size = Math.random() * 8 + 2; // 2px to 10px
            const posX = Math.random() * 100; // 0 to 100%
            const posY = Math.random() * 100; // 0 to 100%
            const delay = Math.random() * 5; // 0 to 5s delay
            const duration = Math.random() * 4 + 4; // 4s to 8s

            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            particle.style.left = `${posX}%`;
            particle.style.top = `${posY}%`;
            particle.style.animationDelay = `${delay}s`;
            particle.style.animationDuration = `${duration}s`;

            particlesContainer.appendChild(particle);
        }
    }
});
