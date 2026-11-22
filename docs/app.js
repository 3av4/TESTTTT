/* =============================================================================
 * BitPoin (BTP) — التطبيق الثابت (GitHub Pages)
 * يعمل كلياً في المتصفح: بلا خادم، بلا قاعدة بيانات خارجية.
 * كل البيانات محفوظة في localStorage لكل مستخدم على جهازه.
 * ============================================================================= */
(function () {
  "use strict";

  var Core = window.BitPoinCore;
  var BOT = "BitPoinBot";
  var BOT_URL = "https://t.me/" + BOT;

  /* ============================== أدوات مساعدة ============================== */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "text") node.textContent = value;
        else if (key.indexOf("on") === 0 && typeof value === "function") node.addEventListener(key.slice(2), value);
        else if (key === "dataset") Object.assign(node.dataset, value);
        else node.setAttribute(key, value);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (child) {
        if (child === null || child === undefined) return;
        node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
      });
    }
    return node;
  }

  function fmt(value) {
    var number = Number(value || 0);
    return number.toLocaleString("en-US");
  }

  function fmtShort(value) {
    var number = Number(value || 0);
    if (Math.abs(number) >= 1e9) return (number / 1e9).toFixed(1) + "B";
    if (Math.abs(number) >= 1e6) return (number / 1e6).toFixed(1) + "M";
    if (Math.abs(number) >= 1e3) return (number / 1e3).toFixed(1) + "K";
    return String(number);
  }

  function duration(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var secs = seconds % 60;
    if (days > 0) return days + " يوم و " + hours + " ساعة";
    if (hours > 0) return hours + " ساعة و " + minutes + " دقيقة";
    if (minutes > 0) return minutes + " دقيقة و " + secs + " ثانية";
    return secs + " ثانية";
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return "الآن";
    if (diff < 3600) return "قبل " + Math.floor(diff / 60) + " دقيقة";
    if (diff < 86400) return "قبل " + Math.floor(diff / 3600) + " ساعة";
    return "قبل " + Math.floor(diff / 86400) + " يوم";
  }

  function dateAr(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("ar-DZ", { dateStyle: "medium", timeStyle: "short" });
    } catch (error) {
      return new Date(iso).toLocaleString();
    }
  }

  function escapeHtml(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ================================ التنبيهات ================================ */
  var toastStack = null;
  function toast(message, kind) {
    if (!toastStack) {
      toastStack = document.createElement("div");
      toastStack.className = "toast-stack";
      document.body.appendChild(toastStack);
    }
    var node = el("div", { class: "toast " + (kind || "info"), text: message });
    toastStack.appendChild(node);
    setTimeout(function () {
      node.style.opacity = "0";
      node.style.transition = "opacity .25s";
      setTimeout(function () { node.remove(); }, 260);
    }, 3200);
  }

  function fail(error) {
    var message = error && error.message ? error.message : "حدث خطأ غير متوقع";
    toast(message, "error");
  }

  /* ================================ التوجيه ================================= */
  var routes = {};
  var currentPath = "/";

  function basePath() {
    var path = window.location.pathname;
    // GitHub Pages subpath: /TESTTTT/
    var match = path.match(/^\/[^/]+\//);
    if (match && !path.startsWith("/docs")) return match[0];
    return "/";
  }

  var BASE = basePath();

  function route(name) {
    var path = window.location.hash.replace(/^#/, "") || "/";
    if (path.charAt(0) !== "/") path = "/" + path;
    currentPath = path;
    var segments = path.split("/").filter(Boolean);
    var head = segments[0] || "home";
    var view = routes[head] || routes["404"];
    window.scrollTo({ top: 0, behavior: "instant" });
    var main = $("#app");
    main.innerHTML = "";
    try {
      view(main, segments.slice(1));
    } catch (error) {
      console.error(error);
      main.appendChild(
        el("div", { class: "wrap card mt-6" }, [
          el("h2", { class: "h2", text: "تعذّر تحميل الصفحة" }),
          el("p", { class: "muted mt-2", text: error.message || String(error) }),
          el("button", { class: "btn btn-primary mt-4", onclick: function () { route(); }, text: "المحاولة مجدداً" }),
        ]),
      );
    }
    updateChrome();
  }

  function go(path) {
    if (path.charAt(0) !== "/") path = "/" + path;
    if (window.location.hash === "#" + path) {
      // نفس المسار: لا يُطلق hashchange — أعد الرسم يدوياً
      route();
      return;
    }
    window.location.hash = "#" + path;
  }

  function updateChrome() {
    document.querySelectorAll("[data-nav]").forEach(function (node) {
      var target = node.getAttribute("data-nav");
      var active = target === "/" ? currentPath === "/" : currentPath.indexOf(target) === 0;
      node.classList.toggle("active", active);
    });
    var user = Core.currentUser();
    var wallet = $("#header-wallet");
    var authBtn = $("#header-auth");
    if (wallet) {
      if (user) {
        wallet.innerHTML = "";
        wallet.appendChild(el("span", { class: "pill", text: "💰 " + fmt(user.balance) + " BTP" }));
        wallet.classList.remove("hidden");
      } else {
        wallet.classList.add("hidden");
      }
    }
    if (authBtn) {
      if (user) {
        authBtn.textContent = "خروج";
        authBtn.onclick = function () {
          Core.logout();
          toast("تم تسجيل الخروج", "info");
          go("/");
        };
      } else {
        authBtn.textContent = "دخول";
        authBtn.onclick = function () { go("/login"); };
      }
    }
  }

  /* ================================ المكوّنات ================================ */
  function card(children, options) {
    options = options || {};
    return el("div", { class: "card " + (options.strong ? "card-strong " : "") + (options.className || "") }, children);
  }

  function statCard(label, value, hint, tone) {
    return el("div", { class: "stat" }, [
      el("div", { class: "stat-label", text: label }),
      el("div", { class: "stat-value num " + (tone || ""), text: typeof value === "number" ? fmt(value) : String(value) }),
      hint ? el("div", { class: "stat-hint", text: hint }) : null,
    ]);
  }

  function field(label, input) {
    return el("div", { class: "field" }, [el("label", { text: label }), input]);
  }

  function input(attrs) {
    return el("input", Object.assign({ class: "input" }, attrs));
  }

  function button(label, onclick, variant, extra) {
    return el("button", Object.assign({ class: "btn " + (variant || "btn-ghost"), onclick: onclick, text: label }, extra || {}));
  }

  function sectionHead(title, subtitle, actions) {
    return el("div", { class: "section-head" }, [
      el("div", {}, [
        el("h2", { class: "h2", text: title }),
        subtitle ? el("p", { class: "muted mt-1", text: subtitle }) : null,
      ]),
      actions ? el("div", { class: "wrap-gap" }, actions) : null,
    ]);
  }

  function emptyState(icon, title, description) {
    return el("div", { class: "empty" }, [
      el("div", { class: "empty-icon", text: icon }),
      el("div", { class: "empty-title", text: title }),
      description ? el("p", { class: "muted-sm mt-1", text: description }) : null,
    ]);
  }

  function requireLogin() {
    var user = Core.currentUser();
    if (user) return user;
    var main = $("#app");
    main.innerHTML = "";
    main.appendChild(
      el("div", { class: "wrap-narrow" }, [
        card([
          el("div", { class: "text-center" }, [
            el("div", { style: "font-size:54px", text: "🔐" }),
            el("h2", { class: "h2 mt-2", text: "تحتاج تسجيل الدخول" }),
            el("p", { class: "muted mt-2", text: "سجّل الدخول عبر تلجرام أو ابدأ حساباً تجريبياً فوراً — كل شيء محفوظ على جهازك." }),
            el("div", { class: "row mt-4", style: "justify-content:center;flex-wrap:wrap" }, [
              button("دخول عبر تلجرام", telegramLogin, "btn-primary", { html: '<span>✈️</span><span>دخول عبر تلجرام</span>' }),
              button("حساب تجريبي فوري", demoLogin, "btn-gold"),
            ]),
          ]),
        ], { className: "mt-8" }),
      ]),
    );
    return null;
  }

  /* ================================ المصادقة ================================ */
  function telegramLogin() {
    var win = window.open("https://oauth.telegram.org/auth?bot_id=9107523489&origin=" + encodeURIComponent(location.origin) + "&request_access=write&return_to=" + encodeURIComponent(location.href), "_blank", "width=550,height=650");
    if (!win) {
      toast("اسمح بالنوافذ المنبثقة لإكمال الدخول عبر تلجرام", "error");
      return;
    }
    toast("أكمل الدخول في نافذة تلجرام…", "info");
  }

  function demoLogin(name, isAdmin, redirect) {
    try {
      var user = Core.createUser({
        id: "local_" + (isAdmin ? "admin" : "player"),
        name: name || (isAdmin ? "المدير" : "لاعب تجريبي"),
        username: isAdmin ? "admin" : "player",
        isAdmin: Boolean(isAdmin),
      });
      toast("مرحباً " + user.name + " 👋", "success");
      go(redirect || (isAdmin ? "/admin" : "/dashboard"));
    } catch (error) {
      fail(error);
    }
  }

  /* ================================ الرئيسية ================================ */
  routes.home = function (main) {
    var user = Core.currentUser();
    var stats = Core.stats();

    var hero = el("section", { class: "hero" }, [
      el("div", { class: "wrap" }, [
        el("span", { class: "pill pill-green", html: "🟢 <span>عملة رقمية مجتمعية · حساب واحد للموقع والبوت</span>" }),
        el("h1", { class: "hero-title mt-4", html: 'اكسب، العب، وابنِ ثروتك مع <span class="gradient-text">BitPoin</span>' }),
        el("p", {
          class: "hero-sub",
          text: "عملة BTP مجتمعية: راتب يومي، ألعاب ومراهنات، بنك بفائدة، متجر ألقاب، وقروض وإحالات — كل ذلك من الموقع أو من بوت تلجرام بنفس الرصيد.",
        }),
        el("div", { class: "row mt-6", style: "flex-wrap:wrap" }, [
          user
            ? button("افتح لوحتي →", function () { go("/dashboard"); }, "btn-primary btn-lg")
            : button("ابدأ الآن مجاناً", function () { go("/login"); }, "btn-primary btn-lg"),
          button("جرّب الألعاب", function () { go("/games"); }, "btn-ghost btn-lg"),
          el("a", { class: "btn btn-ghost btn-lg", href: BOT_URL, target: "_blank", rel: "noopener", html: "✈️ بوت تلجرام" }),
        ]),
        el("div", { class: "grid grid-4 mt-8" }, [
          statCard("المستخدمون", stats.users, "حساب مسجّل"),
          statCard("إجمالي المعروض", stats.supply, "BTP في النظام", "green"),
          statCard("المعاملات", stats.totalTransactions, "عملية مالية"),
          statCard("الخزينة", stats.treasury, "ضرائب مُحصّلة", "gold"),
        ]),
      ]),
    ]);
    main.appendChild(hero);

    var wrap = el("div", { class: "wrap" });
    main.appendChild(wrap);

    // الميزات
    var features = [
      ["🎁", "راتب يومي", "من 100 إلى 400 BTP كل 24 ساعة + مكافأة استمرارية تصل إلى +210 لكل يوم."],
      ["🎲", "ألعاب عادلة", "نرد، عملة، ماكينة، وروليت — نتائج عشوائية آمنة على جهازك بلا تلاعب."],
      ["🏦", "بنك بفائدة", "أودِع رصيدك واحصل على 0.5% فائدة يومية تُصرف تلقائياً."],
      ["🛍️", "متجر ألقاب", "اشترِ ألقاباً وشارات تظهر بجانب اسمك في الموقع والبوت."],
      ["👥", "نظام إحالة", "+300 BTP لك و+150 لصديقك عند كل دعوة ناجحة."],
      ["💰", "قروض سريعة", "حتى 5000 BTP فوراً بفائدة 10% ومدة سداد 24 ساعة."],
      ["🥷", "السرقة", "جرّب حظك في سرقة الآخرين — 40% نجاح، وعقوبة عند الفشل."],
      ["📊", "لوحة متصدرين", "تنافس على لقب الأغنى وأفضل لاعب وأفضل داعٍ."],
    ];
    wrap.appendChild(sectionHead("كل ما تحتاجه في مكان واحد", "نفس الميزات متاحة في الموقع وفي بوت تلجرام", null));
    wrap.appendChild(
      el("div", { class: "grid grid-4" }, features.map(function (feature) {
        return card([
          el("div", { class: "feature-ico", text: feature[0] }),
          el("h3", { class: "h3 mt-3", text: feature[1] }),
          el("p", { class: "muted mt-1", text: feature[2] }),
        ], { className: "card-hover" });
      })),
    );

    // المتصدرون
    var board = Core.leaderboard("global");
    wrap.appendChild(
      el("div", { class: "mt-8" }, [
        sectionHead("لوحة المتصدرين", "أغنى الحسابات الآن", [
          button("الكل ←", function () { go("/leaderboard"); }, "btn-ghost btn-sm"),
        ]),
        card(
          board.entries.length === 0
            ? emptyState("🏆", "لا لاعبين بعد", "كن أول من يظهر في لوحة المتصدرين!")
            : el("div", {}, board.entries.slice(0, 6).map(function (entry, index) {
                var medal = ["🥇", "🥈", "🥉"][index] || String(entry.rank);
                return el("div", { class: "tx-row" }, [
                  el("div", { class: "row" }, [
                    el("span", { style: "width:26px;text-align:center", text: medal }),
                    el("span", { style: "font-weight:800;color:#fff", text: (entry.activeTitle ? entry.activeTitle + " " : "") + entry.name }),
                  ]),
                  el("span", { class: "tx-amount in", text: fmt(entry.balance) + " BTP" }),
                ]);
              })),
          { strong: true },
        ),
      ]),
    );

    // الأوامر
    wrap.appendChild(
      el("div", { class: "mt-8" }, [
        card([
          el("div", { class: "between" }, [
            el("div", {}, [
              el("h2", { class: "h2", text: "أوامر البوت جاهزة بضغطة واحدة" }),
              el("p", { class: "muted mt-1", text: "كل أمر مكتوب وواضح — اضغط عليه ليُنسخ ثم الصقه في @BitPoinBot" }),
            ]),
            button("كل الأوامر →", function () { go("/commands"); }, "btn-gold"),
          ]),
          el("div", { class: "cmd-grid mt-4" }, [
            ["/start", "ابدأ استخدام البوت", "🟢"],
            ["/daily", "استلم راتبك اليومي", "🎁"],
            ["/balance", "اعرض رصيدك", "💰"],
            ["/menu", "القائمة التفاعلية بالأزرار", "📱"],
          ].map(function (command) {
            return el("button", { class: "cmd-card", onclick: function () { copyCommand(command[0]); } }, [
              el("div", { class: "cmd-top" }, [
                el("span", { class: "cmd-emoji", text: command[2] }),
                el("span", { class: "cmd-name", text: command[0] }),
              ]),
              el("div", { class: "cmd-desc", text: command[1] }),
            ]);
          })),
        ], { strong: true }),
      ]),
    );

    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================= الأوامر ================================= */
  var COMMANDS = [
    { cmd: "/start", emoji: "🟢", desc: "ابدأ استخدام BitPoin — يعرض رسالة الترحيب والقائمة الرئيسية.", tag: "الكل" },
    { cmd: "/help", emoji: "❓", desc: "قائمة كل الأوامر مع شرح مبسط لكل واحد.", tag: "الكل" },
    { cmd: "/menu", emoji: "📱", desc: "القائمة الرئيسية التفاعلية بأزرار — بديل عن حفظ الأوامر.", tag: "الكل" },
    { cmd: "/balance", emoji: "💰", desc: "رصيدك النقدي ورصيد البنك. اختصار: /b أو /wallet", tag: "الكل" },
    { cmd: "/daily", emoji: "🎁", desc: "استلم راتبك اليومي (100–400 BTP) + مكافأة الاستمرارية. اختصار: /work", tag: "الكل" },
    { cmd: "/profile", emoji: "👤", desc: "ملفك وإحصائياتك ولقبك النشط. اختصار: /me", tag: "الكل" },
    { cmd: "/send", emoji: "💸", desc: "تحويل BTP: /send @username 500 — أو بالرد على رسالة المستخدم.", tag: "الكل" },
    { cmd: "/top", emoji: "🏆", desc: "لوحة المتصدرين عالمياً أو داخل القروب. اختصار: /leaderboard", tag: "الكل" },
    { cmd: "/history", emoji: "📜", desc: "آخر عملياتك (تحويلات، أرباح، رواتب…). اختصار: /log", tag: "الكل" },
    { cmd: "/dice", emoji: "🎲", desc: "لعبة النرد: /dice 100 high — الفوز ×2 (عالٍ 4-6 أو منخفض 1-3).", tag: "لعبة" },
    { cmd: "/coinflip", emoji: "🪙", desc: "لعبة العملة: /coinflip 100 heads — الفوز ×2. اختصار: /cf", tag: "لعبة" },
    { cmd: "/slots", emoji: "🎰", desc: "ماكينة الحظ: /slots 50 — ثلاثة متطابقة حتى ×10.", tag: "لعبة" },
    { cmd: "/roulette", emoji: "🎡", desc: "الروليت: /roulette 100 red — أحمر/أسود ×2، أخضر ×14. اختصار: /rl", tag: "لعبة" },
    { cmd: "/rob", emoji: "🥷", desc: "سرقة مستخدم: /rob @username أو بالرد — نجاح 40%، والفشل يعاقبك.", tag: "اقتصاد" },
    { cmd: "/bank", emoji: "🏦", desc: "البنك والفائدة: /bank deposit 500 أو /bank withdraw 200.", tag: "اقتصاد" },
    { cmd: "/shop", emoji: "🛍️", desc: "المتجر: ألقاب، شارات، مضاعفات، ودروع. اختصار: /store", tag: "اقتصاد" },
    { cmd: "/buy", emoji: "🛒", desc: "شراء عنصر: /buy title_whale — الكود يظهر في /shop.", tag: "اقتصاد" },
    { cmd: "/gift", emoji: "🎀", desc: "إهداء عملات لمستخدم: /gift @username 250 (أو بالرد).", tag: "اقتصاد" },
    { cmd: "/redeem", emoji: "🎟️", desc: "استرداد كود هدية: /redeem BTPGIFT1", tag: "اقتصاد" },
    { cmd: "/referral", emoji: "👥", desc: "رابط الإحالة الخاص بك + أرباحك. اختصار: /ref أو /invite", tag: "اقتصاد" },
    { cmd: "/loan", emoji: "💳", desc: "قرض حتى 5000 BTP: /loan 1000 — سداد خلال 24 ساعة بفائدة 10%.", tag: "اقتصاد" },
    { cmd: "/settings", emoji: "⚙️", desc: "إعدادات القروب: الألعاب، الاقتصاد، الترحيب، حدود الرهان.", tag: "قروب", group: true },
    { cmd: "/top", emoji: "🥇", desc: "ترتيب أغنى أعضاء القروب الحالي — داخل المجموعات.", tag: "قروب", group: true },
    { cmd: "/price", emoji: "📈", desc: "سعر الصرف واقتصاد العملة. اختصار: /economy أو /market", tag: "معلومات" },
    { cmd: "/about", emoji: "ℹ️", desc: "عن BitPoin وميزاته. اختصار: /info", tag: "معلومات" },
    { cmd: "/guide", emoji: "📖", desc: "دليل الاستخدام خطوة بخطوة. اختصار: /tutorial", tag: "معلومات" },
    { cmd: "/search", emoji: "🔍", desc: "ابحث عن مستخدم: /search amin. اختصار: /find", tag: "معلومات" },
    { cmd: "/addcoins", emoji: "➕", desc: "منح BTP: /addcoins @user 1000 [سبب] — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/removecoins", emoji: "➖", desc: "خصم BTP: /removecoins @user 100 [سبب] — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/ban", emoji: "🚫", desc: "حظر مستخدم من المنصة — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/unban", emoji: "✅", desc: "رفع الحظر عن مستخدم — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/broadcast", emoji: "📢", desc: "بث رسالة لكل المستخدمين — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/setfee", emoji: "🧾", desc: "تعديل الضرائب والرسوم — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/stats", emoji: "📊", desc: "إحصائيات النظام: المستخدمون، الحجم، الخزينة — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/createcode", emoji: "🎫", desc: "إنشاء كود هدية قابل للاسترداد — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/setoption", emoji: "🔧", desc: "تعديل إعداد نظام — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/setgroup", emoji: "👨‍👩‍👦", desc: "إعدادات القروب الافتراضية — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/users", emoji: "👥", desc: "قائمة المستخدمين والبحث الإداري — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/award", emoji: "🏅", desc: "منح مكافأة/شارة لمستخدم — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/backup", emoji: "💾", desc: "إنشاء نسخة احتياطية — أدمن فقط.", tag: "أدمن", admin: true },
    { cmd: "/admin", emoji: "👑", desc: "دليل أوامر الإدارة الكامل — أدمن فقط.", tag: "أدمن", admin: true },
  ];

  function copyCommand(command) {
    var clean = command.split(" ")[0];
    var text = command;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("نُسخ: " + text + " — الصقه في @" + BOT, "success");
      }).catch(function () {
        toast("الأمر: " + text, "info");
      });
    } else {
      toast("الأمر: " + text, "info");
    }
  }

  routes.commands = function (main) {
    var filter = "الكل";
    var wrap = el("div", { class: "wrap" });
    main.appendChild(wrap);

    wrap.appendChild(
      el("div", { class: "mt-6 mb-4" }, [
        el("h1", { class: "h1", html: '📋 أوامر البوت <span class="gradient-text">كاملة</span>' }),
        el("p", { class: "muted mt-2", text: "اضغط على أي أمر ليُنسخ تلقائياً — ثم الصقه في محادثة @" + BOT + " وأرسله." }),
        el("div", { class: "row mt-3", style: "flex-wrap:wrap" }, [
          el("a", { class: "btn btn-primary", href: BOT_URL, target: "_blank", rel: "noopener", html: "✈️ افتح @BitPoinBot" }),
          button("🍀 التجربة السريعة بالموقع", function () { go("/games"); }, "btn-ghost"),
        ]),
      ]),
    );

    var tags = ["الكل", "لعبة", "اقتصاد", "قروب", "معلومات", "أدمن"];
    var tabsBox = el("div", { class: "tabs" });
    var gridBox = el("div", { class: "cmd-grid" });
    var countBox = el("p", { class: "muted-sm mt-3" });

    function render() {
      gridBox.innerHTML = "";
      var list = COMMANDS.filter(function (c) { return filter === "الكل" || c.tag === filter; });
      list.forEach(function (command) {
        var tagClass = command.tag === "أدمن" ? "admin" : command.tag === "قروب" ? "group" : command.tag === "معلومات" ? "group" : "";
        gridBox.appendChild(
          el("button", { class: "cmd-card", onclick: function () { copyCommand(command.cmd); } }, [
            el("div", { class: "cmd-top" }, [
              el("span", { class: "cmd-emoji", text: command.emoji }),
              el("span", { class: "cmd-name", text: command.cmd }),
              el("span", { class: "cmd-tag " + tagClass, text: command.tag }),
            ]),
            el("div", { class: "cmd-desc", text: command.desc }),
          ]),
        );
      });
      countBox.textContent = list.length + " أمر معروض · اضغط للنسخ" + (filter === "الكل" ? " · 41 أمراً إجمالاً بكل الصيغ" : "");
    }

    tags.forEach(function (tag) {
      var tab = el("button", { class: "tab" + (tag === filter ? " active" : ""), text: tag });
      tab.addEventListener("click", function () {
        filter = tag;
        tabsBox.querySelectorAll(".tab").forEach(function (node) { node.classList.toggle("active", node.textContent === tag); });
        render();
      });
      tabsBox.appendChild(tab);
    });

    wrap.appendChild(tabsBox);
    wrap.appendChild(gridBox);
    wrap.appendChild(countBox);

    wrap.appendChild(
      el("div", { class: "mt-8" }, [
        card([
          el("h3", { class: "h3", text: "💡 كيف تستخدم أمراً؟" }),
          el("ol", { class: "muted mt-2", style: "padding-inline-start:20px;line-height:2" }, [
            el("li", { text: "اضغط على الأمر في القائمة أعلاه — سيُنسخ تلقائياً." }),
            el("li", { text: "افتح @" + BOT + " في تلجرام واضغط في حقل الكتابة ثم «لصق»." }),
            el("li", { text: "أرسل الأمر — سيصلك الرد خلال ثانية." }),
          ]),
          el("div", { class: "divider" }),
          el("h3", { class: "h3", text: "🔒 ملاحظة مهمة" }),
          el("p", {
            class: "muted mt-1",
            text: "أوامر «أدمن» تحتاج أن يكون معرّف تلجرام حسابك ضمن ADMIN_IDS في إعدادات السيرفر. أوامر «قروب» تعمل داخل المجموعات، والباقي يعمل في الخاص والقروبات.",
          }),
          el("div", { class: "row mt-3", style: "flex-wrap:wrap" }, [
            el("a", { class: "btn btn-primary", href: BOT_URL, target: "_blank", rel: "noopener", text: "افتح البوت الآن" }),
            button("صفحة الحالة", function () { go("/status"); }, "btn-ghost"),
          ]),
        ], { strong: true }),
      ]),
    );

    render();
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================== الدخول ================================== */
  routes.login = function (main) {
    var wrap = el("div", { class: "wrap-narrow" });
    main.appendChild(wrap);

    var user = Core.currentUser();
    if (user) {
      wrap.appendChild(
        card([
          el("div", { class: "text-center" }, [
            el("div", { style: "font-size:52px", text: "👋" }),
            el("h2", { class: "h2 mt-2", text: "أنت مسجّل بالفعل" }),
            el("p", { class: "muted mt-1", text: user.name + " — رصيدك " + fmt(user.balance) + " BTP" }),
            el("div", { class: "row mt-4", style: "justify-content:center;flex-wrap:wrap" }, [
              button("لوحتي", function () { go("/dashboard"); }, "btn-primary"),
              button("تسجيل الخروج", function () { Core.logout(); toast("تم الخروج", "info"); go("/login"); }, "btn-ghost"),
            ]),
          ]),
        ], { className: "mt-8" }),
      );
      return;
    }

    var nameInput = input({ id: "login-name", placeholder: "اسمك (اختياري)", maxlength: "40" });
    var userInput = input({ id: "login-username", placeholder: "username (اختياري)", maxlength: "32", dir: "ltr", style: "text-align:left" });

    wrap.appendChild(
      card([
        el("div", { class: "text-center mb-4" }, [
          el("div", { style: "font-size:52px", text: "🪙" }),
          el("h1", { class: "h1 mt-2", text: "ادخل إلى BitPoin" }),
          el("p", { class: "muted mt-1", text: "حسابك محفوظ على جهازك — لا نطلب كلمة مرور." }),
        ]),

        el("div", { style: "padding:14px;border-radius:14px;background:rgba(16,201,143,.07);border:1px solid rgba(62,227,173,.25)" }, [
          el("p", { class: "h3", text: "⚡ دخول فوري (تجريبي)" }),
          el("p", { class: "muted-sm mt-1", text: "ينشئ حساباً محلياً في متصفحك فوراً برصيد 1000 BTP — كل الميزات تعمل." }),
          el("div", { class: "mt-2" }, [
            field("اسمك", nameInput),
            field("اسم المستخدم (ليظهر في المتصدرين)", userInput),
          ]),
          el("div", { class: "row", style: "flex-wrap:wrap" }, [
            button("دخول كلاعب", function () {
              demoLogin(nameInput.value.trim() || "لاعب", false);
            }, "btn-primary btn-block"),
          ]),
        ]),

        el("div", { class: "divider" }),

        el("div", { style: "padding:14px;border-radius:14px;background:rgba(245,179,1,.06);border:1px solid rgba(245,179,1,.22)" }, [
          el("p", { class: "h3", text: "👑 دخول المدير" }),
          el("p", { class: "muted-sm mt-1", text: "لوحة إدارة كاملة: المستخدمون، الأرصدة، الضرائب، المعاملات." }),
          el("div", { class: "row mt-2" }, [
            button("دخول كمدير", function () { demoLogin("المدير", true); }, "btn-gold btn-block"),
          ]),
        ]),

        el("div", { class: "divider" }),

        el("div", { class: "text-center" }, [
          el("p", { class: "muted-sm", text: "لربط حسابك بالبوت (نفس الرصيد في الموقع وتلجرام):" }),
          el("a", { class: "btn btn-ghost btn-block mt-2", href: BOT_URL, target: "_blank", rel: "noopener", html: "✈️ افتح @BitPoinBot وأرسل /start" }),
          el("p", { class: "muted-sm mt-3", style: "line-height:1.8", text: "ملاحظة: هذه النسخة تعمل بالكامل في متصفحك (GitHub Pages) — بياناتك محفوظة على جهازك فقط ولا تُرسل لأي خادم." }),
        ]),
      ], { className: "mt-8", strong: true }),
    );
  };

  /* ================================ لوحة المستخدم ================================ */
  routes.dashboard = function (main) {
    var user = requireLogin();
    if (!user) return;

    var wrap = el("div", { class: "wrap" });
    main.appendChild(wrap);
    var body = el("div");
    var activeTab = "overview";

    wrap.appendChild(
      el("div", { class: "mt-6 mb-4 between" }, [
        el("div", {}, [
          el("h1", { class: "h1", html: 'لوحتي <span class="gradient-text">' + escapeHtml(user.name) + "</span>" }),
          el("p", { class: "muted mt-1", text: "كل عملياتك محفوظة على جهازك وتظهر فوراً." }),
        ]),
        el("div", { class: "wrap-gap" }, [
          user.isAdmin ? el("span", { class: "pill", text: "👑 مدير" }) : null,
          user.activeTitle ? el("span", { class: "pill pill-green", text: user.activeTitle }) : null,
        ]),
      ]),
    );

    var tabs = [
      ["overview", "نظرة عامة"],
      ["bank", "البنك"],
      ["history", "السجل"],
      ["loans", "القروض"],
      ["referral", "الإحالة"],
      ["inventory", "حقيبتي"],
    ];
    var tabsBox = el("div", { class: "tabs" });
    tabs.forEach(function (tab) {
      var node = el("button", { class: "tab" + (tab[0] === activeTab ? " active" : ""), text: tab[1] });
      node.addEventListener("click", function () {
        activeTab = tab[0];
        tabsBox.querySelectorAll(".tab").forEach(function (item) { item.classList.toggle("active", item === node); });
        renderTab();
      });
      tabsBox.appendChild(node);
    });
    wrap.appendChild(tabsBox);
    wrap.appendChild(body);

    function renderTab() {
      body.innerHTML = "";
      var fresh = Core.currentUser();
      if (!fresh) { go("/login"); return; }

      if (activeTab === "overview") {
        var status = Core.dailyStatus(fresh);
        var dailyCard = card([
          el("h3", { class: "h3", text: "🎁 راتبك اليومي" }),
          el("p", { class: "muted mt-1", text: "المتوقع: " + fmt(status.estimatedMin) + " – " + fmt(status.estimatedMax) + " BTP" }),
          el("p", { class: "muted-sm mt-1", text: "🔥 سلسلة: " + fresh.streak + " يوم" }),
          el("div", { class: "mt-3" }, [
            status.canClaim
              ? button("استلم الآن", function () {
                  try {
                    var result = Core.claimDaily();
                    Core.payoutReferral();
                    toast("🎉 +" + fmt(result.amount) + " BTP — رصيدك " + fmt(result.balance), "success");
                    renderTab();
                    updateChrome();
                  } catch (error) { fail(error); }
                }, "btn-gold btn-block btn-lg")
              : el("div", {
                  class: "text-center",
                  style: "padding:12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07)",
                }, [
                  el("p", { class: "muted-sm", text: "الراتب القادم بعد" }),
                  el("p", { class: "num", style: "font-size:19px;font-weight:900;color:#fff", id: "daily-countdown", text: duration(status.secondsRemaining) }),
                ]),
          ]),
        ], { strong: true });

        var trAmount = input({ id: "tr-amount", type: "number", placeholder: "100", inputmode: "numeric" });
        var trPreview = el("div", { id: "tr-preview", class: "muted-sm" });
        trAmount.addEventListener("input", function () {
          var amount = Number(trAmount.value || 0);
          if (!amount || amount < 1) { trPreview.textContent = ""; return; }
          var preview = Core.transferPreview(amount);
          trPreview.innerHTML = "سيصل: <b style='color:#7ff5d0'>" + fmt(preview.net) + " BTP</b> · ضريبة: " + fmt(preview.tax) + " BTP (" + preview.taxPercent + "%)";
        });

        var transferCard = card([
          el("h3", { class: "h3", text: "💸 تحويل BTP" }),
          field("إلى (username أو الاسم)", input({ id: "tr-to", placeholder: "مثال: btp_admin", dir: "ltr", style: "text-align:left" })),
          field("المبلغ", trAmount),
          trPreview,
          el("div", { class: "mt-2" }, [
            button("إرسال", function () {
              try {
                var result = Core.transfer($("#tr-to").value.trim(), Number($("#tr-amount").value));
                Core.payoutReferral();
                toast("✅ أُرسل " + fmt(result.net) + " BTP (ضريبة " + fmt(result.tax) + ")", "success");
                renderTab();
                updateChrome();
              } catch (error) { fail(error); }
            }, "btn-primary btn-block"),
          ]),
        ]);

        var stats = Core.gameStats(fresh);
        body.appendChild(el("div", { class: "grid grid-4" }, [
          statCard("الرصيد النقدي", fresh.balance, "BTP جاهز للاستخدام", "green"),
          statCard("رصيد البنك", fresh.bankBalance, "بفائدة يومية"),
          statCard("جولات الألعاب", stats.played, stats.won + " فوز"),
          statCard("إجمالي الأرباح", stats.winnings, "BTP", "gold"),
        ]));
        body.appendChild(el("div", { class: "grid grid-2 mt-4" }, [dailyCard, transferCard]));
        body.appendChild(
          card([
            el("div", { class: "between" }, [
              el("h3", { class: "h3", text: "⚡ إجراءات سريعة" }),
              el("span", { class: "muted-sm", text: "كل شيء بضغطة" }),
            ]),
            el("div", { class: "row mt-3", style: "flex-wrap:wrap" }, [
              button("🎲 العب", function () { go("/games"); }, "btn-primary btn-sm"),
              button("🏦 البنك", function () { activeTab = "bank"; renderTab(); }, "btn-ghost btn-sm"),
              button("🛍️ المتجر", function () { go("/shop"); }, "btn-ghost btn-sm"),
              button("🥷 سرقة", function () { go("/rob"); }, "btn-ghost btn-sm"),
              button("📋 الأوامر", function () { go("/commands"); }, "btn-ghost btn-sm"),
              button("🤖 ربط البوت", function () { go("/link"); }, "btn-ghost btn-sm"),
              user.isAdmin ? button("👑 لوحة الإدارة", function () { go("/admin"); }, "btn-gold btn-sm") : null,
            ]),
          ]),
        );

        // عدّاد تنازلي حي
        var timer = setInterval(function () {
          var node = $("#daily-countdown");
          if (!node) { clearInterval(timer); return; }
          var fresh2 = Core.currentUser();
          if (!fresh2) { clearInterval(timer); return; }
          var st = Core.dailyStatus(fresh2);
          if (st.canClaim) { clearInterval(timer); renderTab(); return; }
          node.textContent = duration(st.secondsRemaining);
        }, 1000);
      }

      if (activeTab === "bank") {
        var bank = Core.bankInfo();
        body.appendChild(
          card([
            el("h3", { class: "h3", text: "🏦 بنك BitPoin" }),
            el("div", { class: "grid grid-2 mt-3" }, [
              statCard("الرصيد البنكي", bank.bankBalance, "فائدة " + bank.interestPercent + "% يومياً"),
              statCard("الفائدة المتوقعة", bank.pendingInterest, "تُصرف كل 24 ساعة", "gold"),
            ]),
            el("div", { class: "divider" }),
            el("div", { class: "grid grid-2" }, [
              el("div", {}, [
                field("إيداع", input({ id: "bank-dep", type: "number", placeholder: String(bank.minDeposit), inputmode: "numeric" })),
                button("إيداع", function () {
                  try {
                    Core.deposit(Number($("#bank-dep").value));
                    toast("تم الإيداع ✅", "success");
                    renderTab(); updateChrome();
                  } catch (error) { fail(error); }
                }, "btn-primary btn-block"),
              ]),
              el("div", {}, [
                field("سحب", input({ id: "bank-wd", type: "number", placeholder: "100", inputmode: "numeric" })),
                button("سحب", function () {
                  try {
                    Core.withdraw(Number($("#bank-wd").value));
                    toast("تم السحب ✅", "success");
                    renderTab(); updateChrome();
                  } catch (error) { fail(error); }
                }, "btn-ghost btn-block"),
              ]),
            ]),
            el("p", { class: "muted-sm mt-3", text: "أدنى إيداع " + bank.minDeposit + " BTP · أقصى سعة " + fmt(bank.capacity) + " BTP" }),
          ], { strong: true }),
        );
      }

      if (activeTab === "history") {
        var list = Core.transactions({ limit: 50 });
        var typeNames = {
          daily: "راتب يومي", transfer: "تحويل", game_win: "ربح لعبة", game_bet: "رهان",
          shop_purchase: "شراء", bank_deposit: "إيداع", bank_withdraw: "سحب",
          bank_interest: "فائدة بنكية", rob: "سرقة", rob_penalty: "عقوبة سرقة",
          referral: "مكافأة إحالة", loan: "قرض", loan_repay: "سداد قرض",
          admin_credit: "منحة إدارية", admin_debit: "خصم إداري",
        };
        body.appendChild(
          card([
            sectionHead("📜 سجل المعاملات", list.total + " عملية مسجّلة"),
            list.items.length === 0
              ? emptyState("📭", "لا معاملات بعد", "ابدأ باستلام راتبك اليومي أو لعبة.")
              : el("div", {}, list.items.map(function (tx) {
                  var isIn = tx.recipientId === fresh.id;
                  return el("div", { class: "tx-row" }, [
                    el("div", {}, [
                      el("div", { class: "tx-type", text: typeNames[tx.type] || tx.type }),
                      el("div", { class: "muted-sm", text: timeAgo(tx.createdAt) + (tx.tax ? " · ضريبة " + fmt(tx.tax) : "") }),
                    ]),
                    el("div", { class: "tx-amount " + (isIn ? "in" : "out"), text: (isIn ? "+" : "−") + fmt(tx.amount) + " BTP" }),
                  ]);
                })),
          ], { strong: true }),
        );
      }

      if (activeTab === "loans") {
        var info = Core.loanInfo();
        body.appendChild(
          card([
            sectionHead("💳 القروض", "حتى " + info.maxAmount + " BTP · فائدة " + info.interestPercent + "% · مدة " + info.durationHours + " ساعة"),
            info.active
              ? el("div", {}, [
                  el("div", { class: "grid grid-2" }, [
                    statCard("المبلغ الأصلي", info.active.principal, "BTP"),
                    statCard("إجمالي السداد", info.active.totalDue, "شامل الفائدة", "gold"),
                  ]),
                  el("p", { class: "muted-sm mt-2", text: "الاستحقاق: " + dateAr(info.active.dueAt) }),
                  el("div", { class: "mt-3" }, [
                    button("سداد الآن", function () {
                      try {
                        var result = Core.repayLoan();
                        toast(result.message + " — رصيدك " + fmt(result.balance), "success");
                        renderTab(); updateChrome();
                      } catch (error) { fail(error); }
                    }, "btn-primary btn-block"),
                  ]),
                ])
              : el("div", {}, [
                  field("المبلغ المطلوب", input({ id: "loan-amount", type: "number", placeholder: "1000", inputmode: "numeric" })),
                  button("طلب قرض", function () {
                    try {
                      var loan = Core.takeLoan(Number($("#loan-amount").value));
                      toast("✅ أُضيف القرض — استحقاق " + fmt(loan.totalDue) + " BTP", "success");
                      renderTab(); updateChrome();
                    } catch (error) { fail(error); }
                  }, "btn-gold btn-block"),
                ]),
            info.history.length > 0
              ? el("div", { class: "mt-4" }, [
                  el("p", { class: "muted-sm mb-2", text: "السجل" }),
                  el("div", {}, info.history.map(function (loan) {
                    return el("div", { class: "tx-row" }, [
                      el("span", { class: "muted", text: dateAr(loan.createdAt) }),
                      el("span", { class: "tx-amount " + (loan.status === "paid" ? "in" : "out"), text: fmt(loan.principal) + " → " + fmt(loan.totalDue) }),
                    ]);
                  })),
                ])
              : null,
          ], { strong: true }),
        );
      }

      if (activeTab === "referral") {
        var referral = Core.referralInfo();
        body.appendChild(
          card([
            sectionHead("👥 برنامج الإحالة", "اربح " + referral.rewardInviter + " BTP لكل صديق — ويحصل هو على " + referral.rewardInvitee + " BTP"),
            el("div", { class: "grid grid-3" }, [
              statCard("مدعوون", referral.invitedCount),
              statCard("مكتمل", referral.paidCount, "مدفوع", "green"),
              statCard("أرباحي", referral.earnings, "BTP", "gold"),
            ]),
            el("div", { class: "mt-4", style: "padding:12px;border-radius:12px;background:rgba(8,11,20,.7);border:1px solid rgba(255,255,255,.1)" }, [
              el("p", { class: "muted-sm", text: "رابط الإحالة" }),
              el("p", { class: "mono num break mt-1", style: "color:#7ff5d0;font-size:12px", text: referral.link }),
            ]),
            el("div", { class: "row mt-3", style: "flex-wrap:wrap" }, [
              button("📋 نسخ الرابط", function () {
                if (navigator.clipboard) navigator.clipboard.writeText(referral.link).then(function () { toast("نُسخ الرابط ✅", "success"); });
              }, "btn-primary btn-sm"),
              el("a", { class: "btn btn-ghost btn-sm", href: "https://t.me/share/url?url=" + encodeURIComponent(referral.link) + "&text=" + encodeURIComponent("انضم إلى BitPoin واحصل على مكافأة ترحيب!"), target: "_blank", rel: "noopener", text: "مشاركة" }),
              button("🎟️ تجربة استرداد كود", function () {
                var code = prompt("أدخل كود الإحالة لتجربة المكافأة:");
                if (!code) return;
                if (Core.applyReferral(code)) { toast("تم ربط الإحالة ✅", "success"); renderTab(); }
                else toast("كود غير صالح", "error");
              }, "btn-ghost btn-sm"),
            ]),
            referral.invited.length > 0
              ? el("div", { class: "mt-4" }, [
                  el("p", { class: "muted-sm mb-2", text: "المدعوون" }),
                  el("div", {}, referral.invited.map(function (inv) {
                    return el("div", { class: "tx-row" }, [
                      el("span", { style: "font-weight:800;color:#fff", text: inv.name }),
                      el("span", { class: "pill " + (inv.status === "paid" ? "pill-green" : "pill-neutral"), text: inv.status === "paid" ? "+" + fmt(inv.reward) + " BTP" : "بانتظار التفعيل" }),
                    ]);
                  })),
                ])
              : emptyState("👤", "لم تدعُ أحداً بعد", "شارك رابطك وابدأ بالربح."),
          ], { strong: true }),
        );
      }

      if (activeTab === "inventory") {
        var items = Object.values(fresh.inventory || {});
        body.appendChild(
          card([
            sectionHead("🎒 حقيبتي", items.length + " عنصر"),
            items.length === 0
              ? emptyState("🛍️", "حقيبتك فارغة", "اشترِ ألقاباً وشارات من المتجر.")
              : el("div", { class: "grid grid-3" }, items.map(function (item) {
                  return el("div", { style: "padding:12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07)" }, [
                    el("div", { style: "font-size:26px", text: item.icon || "🎁" }),
                    el("p", { class: "h3 mt-1", text: item.name }),
                    el("p", { class: "muted-sm", text: "الكمية: " + item.qty }),
                  ]);
                })),
            el("div", { class: "mt-4" }, [button("تسوّق الآن →", function () { go("/shop"); }, "btn-gold")]),
          ], { strong: true }),
        );
      }
    }

    renderTab();
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================== الألعاب ================================== */
  var GAMES = [
    { key: "dice", name: "النرد", emoji: "🎲", tagline: "عالٍ أو منخفض — ×2" },
    { key: "coinflip", name: "العملة", emoji: "🪙", tagline: "صورة أو كتابة — ×2" },
    { key: "slots", name: "الماكينة", emoji: "🎰", tagline: "ثلاثة رموز — حتى ×10" },
    { key: "roulette", name: "الروليت", emoji: "🎡", tagline: "أحمر/أسود ×2 · أخضر ×14" },
  ];

  var CHOICES = {
    dice: [["high", "عالٍ (4-6)", "×2"], ["low", "منخفض (1-3)", "×2"]],
    coinflip: [["heads", "👑 صورة", "×2"], ["tails", "🦅 كتابة", "×2"]],
    slots: [],
    roulette: [["red", "🔴 أحمر", "×2"], ["black", "⚫ أسود", "×2"], ["green", "🟢 أخضر (0)", "×14"]],
  };

  routes.games = function (main) {
    var user = requireLogin();
    if (!user) return;

    var wrap = el("div", { class: "wrap" });
    main.appendChild(wrap);

    var gameKey = "dice";
    var choice = "high";
    var lastResult = null;
    var spinning = false;

    wrap.appendChild(
      el("div", { class: "mt-6 mb-4 between" }, [
        el("div", {}, [
          el("h1", { class: "h1", html: '🎮 <span class="gradient-text">الألعاب</span>' }),
          el("p", { class: "muted mt-1", text: "ضريبة أرباح 5% · نتائج عشوائية آمنة · حدود 10–5000 BTP" }),
        ]),
        el("span", { class: "pill", text: "💰 " + fmt(user.balance) + " BTP" }),
      ]),
    );

    var gameTabs = el("div", { class: "grid grid-4 mb-4" });
    GAMES.forEach(function (game) {
      var node = el("button", {
        class: "cmd-card",
        style: game.key === gameKey ? "border-color:rgba(62,227,173,.5);background:rgba(16,201,143,.08)" : "",
        onclick: function () {
          gameKey = game.key;
          choice = (CHOICES[game.key][0] || [""])[0];
          lastResult = null;
          gameTabs.querySelectorAll(".cmd-card").forEach(function (n) { n.style.cssText = ""; });
          node.style.cssText = "border-color:rgba(62,227,173,.5);background:rgba(16,201,143,.08)";
          renderPlay();
        },
      }, [
        el("div", { style: "font-size:24px", text: game.emoji }),
        el("div", { class: "h3 mt-1", text: game.name }),
        el("div", { class: "muted-sm", text: game.tagline }),
      ]);
      gameTabs.appendChild(node);
    });
    wrap.appendChild(gameTabs);

    var playBox = el("div");
    var sideBox = el("div");
    wrap.appendChild(el("div", { class: "grid", style: "grid-template-columns:1.6fr 1fr" }, [playBox, sideBox]));

    function renderPlay() {
      playBox.innerHTML = "";
      var game = GAMES.find(function (g) { return g.key === gameKey; });
      var display;
      if (gameKey === "slots") {
        var reels = (lastResult && lastResult.details.reels) || ["🍒", "🍋", "🔔"];
        display = el("div", { class: "reels" }, reels.map(function (symbol) {
          return el("div", { class: "reel" + (spinning ? " spin" : ""), text: symbol });
        }));
      } else if (gameKey === "dice") {
        display = el("div", { class: "big-emoji", text: "🎲" });
      } else if (gameKey === "coinflip") {
        display = el("div", { class: "big-emoji", text: "🪙" });
      } else {
        display = el("div", { class: "big-emoji", text: "🎡" });
      }

      var resultLine = "";
      if (lastResult) {
        resultLine = lastResult.won
          ? "🎉 +" + fmt(lastResult.payout) + " BTP — " + lastResult.result
          : "😢 −" + fmt(lastResult.bet) + " BTP — " + lastResult.result;
      }

      var choicesBox = el("div", { class: "choice-grid" });
      (CHOICES[gameKey] || []).forEach(function (option) {
        var node = el("button", { class: "choice" + (choice === option[0] ? " active" : ""), html: option[1] + ' <span style="opacity:.6;font-size:10px">' + option[2] + "</span>" });
        node.addEventListener("click", function () {
          choice = option[0];
          choicesBox.querySelectorAll(".choice").forEach(function (n) { n.classList.remove("active"); });
          node.classList.add("active");
        });
        choicesBox.appendChild(node);
      });

      var betInput = input({ type: "number", value: "100", inputmode: "numeric", min: "10", max: "5000" });

      playBox.appendChild(
        card([
          el("h3", { class: "h3", text: game.emoji + " " + game.name }),
          el("div", { class: "play-area" }, [display]),
          resultLine ? el("p", { class: "text-center", style: "font-weight:900;margin-bottom:12px", text: resultLine }) : null,
          (CHOICES[gameKey] || []).length > 0 ? choicesBox : el("p", { class: "muted-sm text-center mb-2", text: "🍒🍒🍒 ×4 · 💎×7 · 7️⃣×10 · رابحان ×1.5" }),
          el("div", { class: "mt-3" }, [field("الرهان (BTP)", betInput)]),
          button("⚡ العب الآن", function () {
            try {
              spinning = gameKey === "slots";
              Core.payoutReferral();
              var result = Core.play(gameKey, Number(betInput.value), choice);
              lastResult = result;
              if (result.won) toast("🎉 فوز +" + fmt(result.payout) + " BTP", "success");
              else toast("😢 خسارة " + fmt(result.bet) + " BTP", "info");
              setTimeout(function () {
                spinning = false;
                renderPlay();
                renderSide();
                updateChrome();
              }, gameKey === "slots" ? 420 : 120);
            } catch (error) { fail(error); }
          }, "btn-gold btn-block btn-lg"),
          el("div", { class: "row mt-2", style: "justify-content:space-between" }, [
            el("span", { class: "muted-sm", text: "حدود: 10 – 5000 BTP" }),
            el("span", { class: "muted-sm", text: "ضريبة الأرباح 5%" }),
          ]),
        ], { strong: true }),
      );
    }

    function renderSide() {
      sideBox.innerHTML = "";
      var fresh = Core.currentUser();
      var stats = Core.gameStats(fresh);
      sideBox.appendChild(
        card([
          el("h3", { class: "h3", text: "📊 إحصاءاتك" }),
          el("div", { class: "grid", style: "grid-template-columns:1fr 1fr;gap:8px;margin-top:10px" }, [
            statCard("جولات", stats.played),
            statCard("فوز", stats.won, "", "green"),
            statCard("مراهنات", stats.wagered),
            statCard("أرباح", stats.winnings, "", "gold"),
          ]),
        ]),
      );
      var board = Core.leaderboard("games");
      sideBox.appendChild(
        el("div", { class: "mt-4" }, [
          card([
            el("h3", { class: "h3", text: "🏆 أفضل اللاعبين" }),
            board.entries.length === 0 ? emptyState("🎯", "لا بيانات بعد") :
              el("div", { class: "mt-2" }, board.entries.slice(0, 5).map(function (entry, index) {
                var net = (entry.score || 0);
                return el("div", { class: "tx-row" }, [
                  el("span", { class: "row" }, [
                    el("span", { style: "width:22px;text-align:center", text: ["🥇", "🥈", "🥉"][index] || String(index + 1) }),
                    el("span", { style: "font-weight:800;color:#fff", text: entry.name }),
                  ]),
                  el("span", { class: "tx-amount " + (net >= 0 ? "in" : "out"), text: (net >= 0 ? "+" : "") + fmt(net) }),
                ]);
              })),
          ]),
        ]),
      );
      sideBox.appendChild(
        el("div", { class: "mt-4" }, [
          card([
            el("h3", { class: "h3", text: "📋 الأوامر المقابلة" }),
            el("p", { class: "muted-sm mt-1", text: "نفس الألعاب متاحة في البوت:" }),
            el("div", { class: "wrap-gap mt-2" }, GAMES.map(function (game) {
              return el("button", { class: "pill pill-neutral", style: "cursor:pointer", text: "/" + game.key, onclick: function () { copyCommand("/" + game.key + " 100"); } });
            })),
          ]),
        ]),
      );
    }

    renderPlay();
    renderSide();
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================== المتجر ================================== */
  routes.shop = function (main) {
    var user = requireLogin();
    if (!user) return;

    var wrap = el("div", { class: "wrap" });
    main.appendChild(wrap);

    wrap.appendChild(
      el("div", { class: "mt-6 mb-4 between" }, [
        el("div", {}, [
          el("h1", { class: "h1", html: '🛍️ <span class="gradient-text">المتجر</span>' }),
          el("p", { class: "muted mt-1", text: "ألقاب وشارات تظهر بجانب اسمك في الموقع والبوت" }),
        ]),
        el("span", { class: "pill", text: "💰 " + fmt(user.balance) + " BTP" }),
      ]),
    );

    var items = Core.shopItems();
    var gridBox = el("div", { class: "grid grid-3" });
    items.forEach(function (item) {
      var owned = item.owned > 0;
      var canAfford = user.balance >= item.price;
      gridBox.appendChild(
        card([
          el("div", { class: "between" }, [
            el("div", { style: "font-size:34px", text: item.icon }),
            owned ? el("span", { class: "pill pill-green", text: "تملكه" }) : null,
          ]),
          el("h3", { class: "h3 mt-2", text: item.name }),
          el("p", { class: "muted mt-1", style: "min-height:42px", text: item.description }),
          el("p", { class: "num mt-2", style: "font-size:19px;font-weight:900;color:#ffe08a", text: fmt(item.price) + " BTP" }),
          el("div", { class: "mt-3" }, [
            button(owned && item.title ? "تفعيل اللقب" : owned && item.kind === "badge" ? "مملوك" : canAfford ? "شراء" : "رصيد غير كافٍ", function () {
              try {
                if (owned && item.title) {
                  Core.equipTitle(item.code);
                  toast("تم تفعيل " + item.name, "success");
                } else {
                  var result = Core.buyItem(item.code, 1);
                  toast(result.message, "success");
                }
                route();
                updateChrome();
              } catch (error) { fail(error); }
            }, owned && item.title ? "btn-primary btn-block" : canAfford && !(owned && item.kind === "badge") ? "btn-gold btn-block" : "btn-ghost btn-block", { disabled: owned && item.kind === "badge" ? "disabled" : null }),
          ]),
        ], { className: "card-hover" }),
      );
    });
    wrap.appendChild(gridBox);

    wrap.appendChild(
      el("div", { class: "mt-6" }, [
        card([
          el("h3", { class: "h3", text: "💡 كيف تعمل العناصر؟" }),
          el("div", { class: "grid grid-4 mt-3" }, [
            ["🏷️", "الألقاب", "تظهر بجانب اسمك في المتصدرين وفي رسائل البوت."],
            ["⚡", "المضاعفات", "تُطبَّق على راتبك القادم مباشرة."],
            ["🛡️", "الدروع", "تحميك من أول محاولة سرقة."],
            ["✅", "الشارات", "دائمة — تُشترى مرة واحدة فقط."],
          ].map(function (row) {
            return el("div", { style: "padding:12px;border-radius:12px;background:rgba(255,255,255,.03)" }, [
              el("div", { style: "font-size:22px", text: row[0] }),
              el("p", { class: "h3 mt-1", text: row[1] }),
              el("p", { class: "muted-sm mt-1", text: row[2] }),
            ]);
          })),
        ]),
      ]),
    );
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================== السرقة ================================== */
  routes.rob = function (main) {
    var user = requireLogin();
    if (!user) return;
    var wrap = el("div", { class: "wrap-narrow" });
    main.appendChild(wrap);
    var status = Core.robStatus();

    wrap.appendChild(
      el("div", { class: "mt-6" }, [
        el("h1", { class: "h1", html: '🥷 <span class="gradient-text">السرقة</span>' }),
        el("p", { class: "muted mt-1", text: "نسبة نجاح 40% · عقوبة 20% عند الفشل · فاصل 30 دقيقة" }),
      ]),
    );

    var targetInput = input({ placeholder: "username أو اسم الضحية", dir: "ltr", style: "text-align:left" });

    wrap.appendChild(
      card([
        el("div", { class: "play-area" }, [el("div", { class: "big-emoji", text: "🥷" })]),
        field("الضحية", targetInput),
        status.available
          ? button("🥷 حاول الآن", function () {
              try {
                var result = Core.rob(targetInput.value.trim());
                toast(result.message, result.success ? "success" : "error");
                route();
                updateChrome();
              } catch (error) { fail(error); }
            }, "btn-danger btn-block btn-lg")
          : el("div", { class: "text-center", style: "padding:12px;border-radius:12px;background:rgba(255,255,255,.03)" }, [
              el("p", { class: "muted-sm", text: "المحاولة القادمة بعد" }),
              el("p", { class: "num", style: "font-size:18px;font-weight:900;color:#fff", text: duration(status.secondsRemaining) }),
            ]),
        el("div", { class: "divider" }),
        el("h3", { class: "h3", text: "📋 الأوامر" }),
        el("div", { class: "wrap-gap mt-2" }, [
          el("button", { class: "pill pill-neutral", style: "cursor:pointer", text: "/rob @username", onclick: function () { copyCommand("/rob @username"); } }),
        ]),
      ], { strong: true, className: "mt-4" }),
    );
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================ المتصدرون ================================ */
  routes.leaderboard = function (main) {
    var wrap = el("div", { class: "wrap" });
    main.appendChild(wrap);
    var scope = "global";
    var tabs = [["global", "الأغنى"], ["games", "أفضل اللاعبين"], ["referrals", "أفضل الداعين"]];

    wrap.appendChild(
      el("div", { class: "mt-6" }, [
        el("h1", { class: "h1", html: '🏆 لوحة <span class="gradient-text">المتصدرين</span>' }),
        el("p", { class: "muted mt-1", text: "ترتيب حي حسب الرصيد والأداء" }),
      ]),
    );

    var tabsBox = el("div", { class: "tabs mt-4" });
    var content = el("div");
    tabs.forEach(function (tab) {
      var node = el("button", { class: "tab tab-gold" + (tab[0] === scope ? " active" : ""), text: tab[1] });
      node.addEventListener("click", function () {
        scope = tab[0];
        tabsBox.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t === node); });
        render();
      });
      tabsBox.appendChild(node);
    });
    wrap.appendChild(tabsBox);
    wrap.appendChild(content);

    function render() {
      content.innerHTML = "";
      var board = Core.leaderboard(scope);
      content.appendChild(
        card(
          board.entries.length === 0
            ? emptyState("🏆", "لا بيانات بعد", "كن أول من يظهر في اللوحة!")
            : el("div", {}, board.entries.map(function (entry) {
                var medal = ["🥇", "🥈", "🥉"][entry.rank - 1] || String(entry.rank);
                var score = entry.score;
                return el("div", {
                  class: "tx-row",
                  style: entry.isMe ? "background:rgba(16,201,143,.08);border-radius:10px;padding-inline:10px" : "",
                }, [
                  el("div", { class: "row" }, [
                    el("span", { style: "width:28px;text-align:center;font-weight:800", text: medal }),
                    el("div", {}, [
                      el("div", { style: "font-weight:800;color:#fff", text: (entry.activeTitle ? entry.activeTitle + " " : "") + entry.name + (entry.isMe ? " (أنت)" : "") }),
                      score !== undefined ? el("div", { class: "muted-sm", text: scope === "referrals" ? score + " دعوة" : "صافي " + fmt(score) + " BTP" }) : null,
                    ]),
                  ]),
                  el("span", { class: "tx-amount in", text: fmt(entry.balance) + " BTP" }),
                ]);
              })),
          { strong: true },
        ),
      );
      content.appendChild(
        el("div", { class: "mt-4" }, [
          card([
            el("h3", { class: "h3", text: "📋 أمر البوت" }),
            el("p", { class: "muted-sm mt-1", text: "اعرض نفس القائمة في تلجرام:" }),
            el("div", { class: "wrap-gap mt-2" }, [
              el("button", { class: "pill pill-neutral", style: "cursor:pointer", text: "/top", onclick: function () { copyCommand("/top"); } }),
            ]),
          ]),
        ]),
      );
    }

    render();
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================= الإحالات ================================= */
  routes.referral = function (main) {
    var user = requireLogin();
    if (!user) return;
    var info = Core.referralInfo();
    var wrap = el("div", { class: "wrap-narrow" });
    main.appendChild(wrap);

    wrap.appendChild(
      el("div", { class: "mt-6" }, [
        el("h1", { class: "h1", html: '👥 برنامج <span class="gradient-text">الإحالة</span>' }),
        el("p", { class: "muted mt-1", text: "+" + info.rewardInviter + " BTP لك · +" + info.rewardInvitee + " BTP لصديقك" }),
      ]),
    );

    wrap.appendChild(
      card([
        el("div", { class: "grid grid-4" }, [
          statCard("مدعوون", info.invitedCount),
          statCard("مكتمل", info.paidCount, "", "green"),
          statCard("معلّق", info.pendingCount, "", "gold"),
          statCard("أرباح", info.earnings, "BTP", "gold"),
        ]),
        el("div", { class: "mt-4", style: "padding:12px;border-radius:12px;background:rgba(8,11,20,.7);border:1px solid rgba(255,255,255,.1)" }, [
          el("p", { class: "muted-sm", text: "كودك" }),
          el("p", { class: "mono num mt-1", style: "color:#ffe08a;font-weight:900", text: info.code }),
          el("p", { class: "muted-sm mt-2", text: "رابطك" }),
          el("p", { class: "mono break mt-1", style: "color:#7ff5d0;font-size:12px", text: info.link }),
        ]),
        el("div", { class: "row mt-3", style: "flex-wrap:wrap" }, [
          button("📋 نسخ الرابط", function () {
            if (navigator.clipboard) navigator.clipboard.writeText(info.link).then(function () { toast("نُسخ ✅", "success"); });
            else toast(info.link, "info");
          }, "btn-primary"),
          el("a", { class: "btn btn-ghost", href: "https://t.me/share/url?url=" + encodeURIComponent(info.link) + "&text=" + encodeURIComponent("انضم إلى BitPoin!"), target: "_blank", rel: "noopener", text: "مشاركة عبر تلجرام" }),
        ]),
      ], { strong: true, className: "mt-4" }),
    );

    wrap.appendChild(
      el("div", { class: "mt-4" }, [
        card([
          el("h3", { class: "h3", text: "📋 أوامر الإحالة" }),
          el("div", { class: "wrap-gap mt-2" }, [
            el("button", { class: "pill pill-neutral", style: "cursor:pointer", text: "/referral", onclick: function () { copyCommand("/referral"); } }),
          ]),
          el("p", { class: "muted-sm mt-3", text: "المكافأة تُدفع عند أول نشاط حقيقي للمدعو (راتب أو لعبة)." }),
        ]),
      ]),
    );
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================ ربط الحساب ================================ */
  routes.link = function (main) {
    var wrap = el("div", { class: "wrap-narrow" });
    main.appendChild(wrap);
    var user = Core.currentUser();
    var code = user ? user.referralCode : null;

    wrap.appendChild(
      el("div", { class: "mt-6" }, [
        el("h1", { class: "h1", html: '🤖 ربط حسابك <span class="gradient-text">بالبوت</span>' }),
        el("p", { class: "muted mt-1", text: "نفس الحساب والرصيد في الموقع وفي تلجرام — اربط مرة واحدة." }),
      ]),
    );

    if (!user) {
      wrap.appendChild(
        card([
          emptyState("🔐", "سجّل الدخول أولاً", "أنشئ حسابك ثم عُد لهذه الصفحة للحصول على كود الربط."),
          el("div", { class: "row mt-3", style: "justify-content:center" }, [
            button("دخول", function () { go("/login"); }, "btn-primary"),
          ]),
        ], { strong: true, className: "mt-4" }),
      );
      return;
    }

    var deepLink = "https://t.me/" + BOT + "?start=link_" + code;
    var status = user.telegramLinked
      ? el("div", { class: "row" }, [
          el("span", { class: "pill pill-green", text: "✅ مربوط" }),
          el("span", { class: "muted-sm", text: user.telegramUsername ? "@" + user.telegramUsername : "حساب تلجرام نشط" }),
        ])
      : el("div", { class: "row" }, [el("span", { class: "pill pill-red", text: "غير مربوط بعد" })]);

    wrap.appendChild(
      card([
        el("div", { class: "between" }, [
          el("h3", { class: "h3", text: "حالة الربط" }),
          status,
        ]),
        el("div", { class: "divider" }),

        el("h3", { class: "h3", text: "1️⃣ كود الربط الخاص بك" }),
        el("div", { class: "mt-2", style: "padding:16px;border-radius:14px;text-align:center;background:rgba(245,179,1,.08);border:1px dashed rgba(245,179,1,.4)" }, [
          el("p", { class: "mono num", style: "font-size:26px;font-weight:900;letter-spacing:3px;color:#ffe08a", text: code }),
          el("p", { class: "muted-sm mt-1", text: "صالح للاستخدام مرة واحدة لحسابك" }),
        ]),
        el("div", { class: "row mt-3", style: "flex-wrap:wrap" }, [
          button("📋 نسخ الكود", function () {
            if (navigator.clipboard) navigator.clipboard.writeText(code).then(function () { toast("نُسخ الكود ✅", "success"); });
            else toast(code, "info");
          }, "btn-gold"),
          button("🔗 نسخ رابط الربط", function () {
            if (navigator.clipboard) navigator.clipboard.writeText(deepLink).then(function () { toast("نُسخ رابط الربط ✅", "success"); });
            else toast(deepLink, "info");
          }, "btn-ghost"),
        ]),

        el("div", { class: "divider" }),

        el("h3", { class: "h3", text: "2️⃣ افتح البوت وأرسل الكود" }),
        el("ol", { class: "muted mt-2", style: "padding-inline-start:20px;line-height:2.1" }, [
          el("li", { text: "اضغط الزر أدناه لفتح البوت مباشرة." }),
          el("li", {}, [
            el("span", { text: "أرسل الأمر: " }),
            el("code", { class: "mono", style: "color:#7ff5d0", text: "/link " + code }),
          ]),
          el("li", { text: "سيؤكد البوت الربط، ويصبح رصيدك نفسه في الاثنين." }),
        ]),
        el("div", { class: "mt-3" }, [
          el("a", { class: "btn btn-primary btn-block btn-lg", href: deepLink, target: "_blank", rel: "noopener", html: "✈️ افتح @BitPoinBot برابط الربط" }),
        ]),
        el("div", { class: "row mt-2", style: "justify-content:center" }, [
          el("button", { class: "pill pill-neutral", style: "cursor:pointer", text: "/link " + code, onclick: function () { copyCommand("/link " + code); } }),
        ]),

        el("div", { class: "divider" }),

        el("h3", { class: "h3", text: "3️⃣ (تجريبي) تأكيد الربط على هذا الجهاز" }),
        el("p", { class: "muted-sm mt-1", text: "هذه النسخة الثابتة تعمل بلا خادم، لذا يمكنك تعليم الحساب كمربوط محلياً لمشاهدة الواجهة النهائية." }),
        el("div", { class: "row mt-2", style: "flex-wrap:wrap" }, [
          button(user.telegramLinked ? "فك الربط" : "تأكيد الربط الآن", function () {
            try {
              var next = !user.telegramLinked;
              Core.updateProfile({ telegramLinked: next, telegramUsername: next ? "BitPoinBot" : null });
              toast(next ? "✅ تم ربط الحساب" : "تم فك الربط", next ? "success" : "info");
              route();
            } catch (error) { fail(error); }
          }, user.telegramLinked ? "btn-danger" : "btn-primary"),
        ]),
      ], { strong: true, className: "mt-4" }),
    );

    wrap.appendChild(
      el("div", { class: "mt-4" }, [
        card([
          el("h3", { class: "h3", text: "🔍 لماذا الربط مهم؟" }),
          el("div", { class: "grid grid-3 mt-2" }, [
            ["💰", "رصيد واحد", "ما تربحه في الموقع يظهر فوراً في البوت والعكس."],
            ["🏆", "نفس اللقب", "لقبك وشاراتك تظهر في رسائل البوت."],
            ["📊", "سجل موحّد", "كل معاملاتك في مكان واحد."],
          ].map(function (row) {
            return el("div", { style: "padding:12px;border-radius:12px;background:rgba(255,255,255,.03)" }, [
              el("div", { style: "font-size:22px", text: row[0] }),
              el("p", { class: "h3 mt-1", text: row[1] }),
              el("p", { class: "muted-sm mt-1", text: row[2] }),
            ]);
          })),
        ]),
      ]),
    );
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================== الأدمن ================================== */
  routes.admin = function (main) {
    var user = Core.currentUser();
    if (!user) { go("/login"); return; }
    if (!user.isAdmin) {
      main.appendChild(el("div", { class: "wrap-narrow" }, [card([el("div", { class: "text-center" }, [
        el("div", { style: "font-size:52px", text: "🔒" }),
        el("h2", { class: "h2 mt-2", text: "صلاحيات المدير مطلوبة" }),
        button("دخول كمدير", function () { demoLogin("المدير", true, "/admin"); }, "btn-gold mt-4"),
      ])])]));
      return;
    }

    var wrap = el("div", { class: "wrap" });
    main.appendChild(wrap);
    var tab = "overview";
    var body = el("div");

    wrap.appendChild(
      el("div", { class: "mt-6 mb-4" }, [
        el("h1", { class: "h1", html: '👑 لوحة <span class="gradient-text">الإدارة</span>' }),
        el("p", { class: "muted mt-1", text: "تحكم كامل: المستخدمون، الأرصدة، الاقتصاد، المعاملات" }),
      ]),
    );

    var tabsBox = el("div", { class: "tabs" });
    [["overview", "نظرة عامة"], ["users", "المستخدمون"], ["settings", "الاقتصاد"], ["transactions", "المعاملات"]].forEach(function (item) {
      var node = el("button", { class: "tab" + (item[0] === tab ? " active" : ""), text: item[1] });
      node.addEventListener("click", function () {
        tab = item[0];
        tabsBox.querySelectorAll(".tab").forEach(function (n) { n.classList.toggle("active", n === node); });
        render();
      });
      tabsBox.appendChild(node);
    });
    wrap.appendChild(tabsBox);
    wrap.appendChild(body);

    function render() {
      body.innerHTML = "";
      if (tab === "overview") {
        var data = Core.adminOverview();
        body.appendChild(el("div", { class: "grid grid-4" }, [
          statCard("المستخدمون", data.stats.totalUsers, data.stats.bannedCount + " محظور"),
          statCard("المعروض الكلي", data.economy.totalSupply, "BTP", "green"),
          statCard("الخزينة", data.economy.treasury, "ضرائب", "gold"),
          statCard("المعاملات", data.stats.totalTransactions, "عملية"),
        ]));
        body.appendChild(el("div", { class: "grid grid-4 mt-4" }, [
          statCard("في البنوك", data.economy.heldInBanks),
          statCard("مع المستخدمين", data.economy.heldByUsers),
          statCard("جولات الألعاب", data.economy.games24h),
          statCard("رواتب مدفوعة", data.economy.dailyClaims24h, "", "green"),
        ]));
        body.appendChild(el("div", { class: "mt-4" }, [
          card([
            el("h3", { class: "h3", text: "توزيع الثروة" }),
            el("div", { class: "mt-3" }, [
              ["مع المستخدمين", data.economy.heldByUsers],
              ["في البنوك", data.economy.heldInBanks],
              ["الخزينة", data.economy.treasury],
            ].map(function (row) {
              var percent = data.economy.totalSupply ? (row[1] / data.economy.totalSupply) * 100 : 0;
              return el("div", { class: "mb-2" }, [
                el("div", { class: "between muted-sm" }, [el("span", { text: row[0] }), el("span", { text: fmt(row[1]) + " (" + percent.toFixed(1) + "%)" })]),
                el("div", { style: "height:7px;border-radius:99px;background:rgba(255,255,255,.08);margin-top:4px;overflow:hidden" }, [
                  el("div", { style: "height:100%;width:" + Math.max(2, percent) + "%;background:linear-gradient(90deg,#3ee3ad,#ffe08a)" }),
                ]),
              ]);
            })),
          ]),
        ]));
      }

      if (tab === "users") {
        var list = Core.adminUsers("");
        var table = el("table", { class: "table" });
        table.appendChild(el("thead", {}, [el("tr", {}, ["المستخدم", "الرصيد", "البنك", "الحالة", "إجراءات"].map(function (h) { return el("th", { text: h }); }))]));
        var tbody = el("tbody");
        list.items.forEach(function (u) {
          tbody.appendChild(el("tr", {}, [
            el("td", {}, [el("div", { style: "font-weight:800;color:#fff", text: (u.activeTitle ? u.activeTitle + " " : "") + u.name }), el("div", { class: "muted-sm", text: u.username ? "@" + u.username : u.id })]),
            el("td", { class: "num", text: fmt(u.balance) }),
            el("td", { class: "num", text: fmt(u.bankBalance) }),
            el("td", {}, [el("span", { class: "pill " + (u.isBanned ? "pill-red" : "pill-green"), text: u.isBanned ? "محظور" : "نشط" })]),
            el("td", {}, [
              el("div", { class: "row", style: "gap:4px;flex-wrap:wrap" }, [
                el("button", {
                  class: "btn btn-sm btn-primary",
                  text: "+1000",
                  onclick: function () { try { Core.adminAdjust(u.id, 1000, "add"); toast("أُضيف 1000 لـ " + u.name, "success"); render(); updateChrome(); } catch (e) { fail(e); } },
                }),
                el("button", {
                  class: "btn btn-sm btn-danger",
                  text: "−100",
                  onclick: function () { try { Core.adminAdjust(u.id, 100, "remove"); toast("خُصم 100 من " + u.name, "success"); render(); updateChrome(); } catch (e) { fail(e); } },
                }),
                el("button", {
                  class: "btn btn-sm btn-ghost",
                  text: u.isBanned ? "فك الحظر" : "حظر",
                  onclick: function () { try { Core.adminToggleBan(u.id); render(); } catch (e) { fail(e); } },
                }),
              ]),
            ]),
          ]));
        });
        table.appendChild(tbody);
        body.appendChild(card([sectionHead("👥 المستخدمون", list.total + " حساب"), el("div", { class: "table-wrap" }, [table])], { strong: true }));
      }

      if (tab === "settings") {
        var settings = Core.adminSettings();
        var grid = el("div", { class: "grid grid-2" });
        settings.forEach(function (row) {
          var control = input({ type: "number", value: row.value, id: "set-" + row.key });
          grid.appendChild(
            el("div", { style: "padding:12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)" }, [
              el("p", { class: "h3", text: row.label }),
              el("p", { class: "muted-sm mono", text: row.key }),
              el("div", { class: "row mt-2" }, [
                control,
                button("حفظ", function () {
                  try {
                    Core.adminSaveSetting(row.key, control.value);
                    toast("تم حفظ " + row.label, "success");
                  } catch (error) { fail(error); }
                }, "btn-primary btn-sm"),
              ]),
            ]),
          );
        });
        body.appendChild(card([sectionHead("⚙️ إعدادات الاقتصاد", "تُطبَّق فوراً على كل العمليات القادمة"), grid], { strong: true }));
      }

      if (tab === "transactions") {
        var txs = Core.adminTransactions(50);
        var table2 = el("table", { class: "table" });
        table2.appendChild(el("thead", {}, [el("tr", {}, ["#", "النوع", "من", "إلى", "المبلغ", "الضريبة", "الوقت"].map(function (h) { return el("th", { text: h }); }))]));
        var tbody2 = el("tbody");
        txs.items.forEach(function (tx) {
          tbody2.appendChild(el("tr", {}, [
            el("td", { text: tx.id }),
            el("td", { text: tx.type }),
            el("td", { text: tx.senderName || "—" }),
            el("td", { text: tx.recipientName || "—" }),
            el("td", { class: "num", text: fmt(tx.amount) }),
            el("td", { class: "num", text: tx.tax ? fmt(tx.tax) : "—" }),
            el("td", { text: timeAgo(tx.createdAt) }),
          ]));
        });
        table2.appendChild(tbody2);
        body.appendChild(card([sectionHead("📜 المعاملات", txs.total + " عملية"), el("div", { class: "table-wrap" }, [table2])], { strong: true }));
      }
    }

    render();
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================= الحالة ================================= */
  routes.status = function (main) {
    var wrap = el("div", { class: "wrap-narrow" });
    main.appendChild(wrap);
    var user = Core.currentUser();
    var stats = Core.stats();

    wrap.appendChild(
      el("div", { class: "mt-6 mb-4" }, [
        el("h1", { class: "h1", html: '🩺 حالة <span class="gradient-text">النظام</span>' }),
        el("p", { class: "muted mt-1", text: "كل شيء يعمل محلياً في متصفحك — بلا خادم" }),
      ]),
    );

    var rows = [
      ["🌐", "الموقع", true, "يعمل · GitHub Pages · ثابت وسريع"],
      ["💾", "التخزين المحلي", typeof Storage !== "undefined", "localStorage جاهز — بياناتك محفوظة على جهازك"],
      ["🎮", "محرك الاقتصاد", Boolean(window.BitPoinCore), "راتب، ألعاب، بنك، متجر، إحالات — كلها تعمل"],
      ["🤖", "بوت تلجرام", null, "يعمل على سيرفر مستقل — اضغط للفتح"],
    ];

    rows.forEach(function (row) {
      var ok = row[2];
      wrap.appendChild(
        card([
          el("div", { class: "between" }, [
            el("div", { class: "row" }, [
              el("span", { style: "font-size:22px", text: row[0] }),
              el("div", {}, [
                el("p", { class: "h3", text: row[1] }),
                el("p", { class: "muted-sm", text: row[3] }),
              ]),
            ]),
            ok === null
              ? el("a", { class: "pill pill-green", href: BOT_URL, target: "_blank", rel: "noopener", text: "فتح ✈️" })
              : el("span", { class: "pill " + (ok ? "pill-green" : "pill-red"), text: ok ? "✅ يعمل" : "❌ خطأ" }),
          ]),
        ], { className: "mb-2" }),
      );
    });

    wrap.appendChild(
      el("div", { class: "mt-4" }, [
        card([
          el("h3", { class: "h3", text: "📊 إحصاءات المتصفح" }),
          el("div", { class: "grid grid-3 mt-3" }, [
            statCard("المستخدمون هنا", stats.users),
            statCard("معاملاتك", stats.totalTransactions),
            statCard("خزينة الضرائب", stats.treasury, "BTP", "gold"),
          ]),
          el("div", { class: "divider" }),
          el("h3", { class: "h3", text: "🔗 روابط سريعة" }),
          el("div", { class: "wrap-gap mt-2" }, [
            el("a", { class: "btn btn-primary btn-sm", href: BOT_URL, target: "_blank", rel: "noopener", text: "بوت تلجرام" }),
            button("الأوامر", function () { go("/commands"); }, "btn-ghost btn-sm"),
            button("لوحتي", function () { go("/dashboard"); }, "btn-ghost btn-sm"),
            button("🔄 تحديث", function () { route(); }, "btn-ghost btn-sm"),
          ]),
          user ? el("p", { class: "muted-sm mt-3", text: "مسجّل كـ " + user.name + " · " + fmt(user.balance) + " BTP" }) : null,
        ]),
      ]),
    );

    wrap.appendChild(
      el("div", { class: "mt-6" }, [
        card([
          el("h3", { class: "h3", text: "🗑️ إدارة البيانات المحلية" }),
          el("p", { class: "muted mt-1", text: "كل بياناتك محفوظة في هذا المتصفح فقط. حذفها يعيدك للصفر." }),
          el("div", { class: "row mt-3", style: "flex-wrap:wrap" }, [
            button("تصدير بياناتي", function () {
              var blob = new Blob([Core.exportState()], { type: "application/json" });
              var url = URL.createObjectURL(blob);
              var link = document.createElement("a");
              link.href = url;
              link.download = "bitpoin-backup.json";
              link.click();
              URL.revokeObjectURL(url);
              toast("تم تنزيل النسخة", "success");
            }, "btn-ghost btn-sm"),
            button("حذف كل شيء", function () {
              if (!confirm("هل أنت متأكد؟ ستُحذف كل بياناتك المحلية نهائياً.")) return;
              Core.reset();
              toast("تم الحذف — يمكنك البدء من جديد", "info");
              go("/");
            }, "btn-danger btn-sm"),
          ]),
        ]),
      ]),
    );
    wrap.appendChild(el("div", { style: "height:32px" }));
  };

  /* ================================== 404 ================================== */
  routes["404"] = function (main) {
    main.appendChild(
      el("div", { class: "wrap-narrow" }, [
        card([
          el("div", { class: "text-center" }, [
            el("p", { class: "h1", html: '4<span class="gradient-text">0</span>4' }),
            el("h2", { class: "h2 mt-2", text: "الصفحة غير موجودة" }),
            el("p", { class: "muted mt-1", text: "الرابط غير صالح أو تم نقله." }),
            el("div", { class: "row mt-4", style: "justify-content:center;flex-wrap:wrap" }, [
              button("الرئيسية", function () { go("/"); }, "btn-primary"),
              button("الأوامر", function () { go("/commands"); }, "btn-ghost"),
              button("الحالة", function () { go("/status"); }, "btn-ghost"),
            ]),
          ]),
        ], { className: "mt-8" }),
      ]),
    );
  };

  /* ================================ التشغيل ================================ */
  function bindLayout() {
    var yearNode = $("#year");
    if (yearNode) yearNode.textContent = String(new Date().getFullYear());

    document.querySelectorAll("[data-go]").forEach(function (node) {
      node.addEventListener("click", function (event) {
        event.preventDefault();
        go(node.getAttribute("data-go"));
      });
    });

    window.addEventListener("hashchange", route);
    var authBtn = $("#header-auth");
    if (authBtn) {
      authBtn.addEventListener("click", function () {});
    }
  }

  function init() {
    Core.load();
    bindLayout();
    if (!window.location.hash) window.location.hash = "#/";
    route();
    // مراقبة تغيّر الجلسة
    setInterval(updateChrome, 4000);
    console.log("%cBitPoin (BTP) — تعمل محلياً في متصفحك", "color:#3ee3ad;font-weight:bold");
    console.log("BASE:", BASE);
    console.log("كل البيانات في localStorage: bitpoin.state.v1");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
