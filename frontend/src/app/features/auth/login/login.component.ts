import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Login con identidad propia del taller: el fondo es la banda de rodadura de una llanta
 * que rueda lentamente, y el acceso es una "orden de ingreso" con talón troquelado.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="login-page">
      <!-- Banda de rodadura -->
      <div class="tread" aria-hidden="true"><div class="tread-band"></div></div>

      <header class="top">
        <span class="mark"><img src="servillantaslogo.png" alt="" /></span>
        <span class="brand">
          <strong>Servillantas RV</strong>
          <small>Llantas · Lubricantes · Taller</small>
        </span>
      </header>

      <main class="center">
        <div class="ticket-shadow">
          <section class="ticket" aria-labelledby="login-title">
            <div class="ticket-main">
              <div class="ticket-head">
                <div>
                  <h1 id="login-title">Ingreso al sistema</h1>
                  <p>Ingresa con tu cuenta para abrir tu turno.</p>
                </div>
                <span class="stamp" aria-hidden="true">
                  <span>{{ dia }}</span>
                  <span>{{ mes }}</span>
                </span>
              </div>

              @if (errorMensaje) {
                <div class="alert" role="alert">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>
                  <span>{{ errorMensaje }}</span>
                </div>
              }

              <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" novalidate>
                <div class="field" [class.has-error]="esCampoInvalido('correo')">
                  <label for="correo">Correo electrónico</label>
                  <input id="correo" type="email" formControlName="correo" placeholder="nombre@servillantas.pe" autocomplete="email" />
                  @if (esCampoInvalido('correo')) { <span class="field-error">Ingresa un correo electrónico válido.</span> }
                </div>

                <div class="field" [class.has-error]="esCampoInvalido('password')">
                  <label for="password">Contraseña</label>
                  <div class="pass">
                    <input id="password" [type]="verPassword ? 'text' : 'password'" formControlName="password" placeholder="Tu contraseña" autocomplete="current-password" />
                    <button type="button" class="eye" (click)="verPassword = !verPassword"
                      [attr.aria-label]="verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'" [attr.aria-pressed]="verPassword">
                      @if (verPassword) {
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><path d="m2 2 20 20"></path></svg>
                      } @else {
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      }
                    </button>
                  </div>
                  @if (esCampoInvalido('password')) { <span class="field-error">La contraseña es obligatoria.</span> }
                </div>

                <button type="submit" class="submit" [disabled]="cargando || loginForm.invalid">
                  <span>{{ cargando ? 'Ingresando…' : 'Ingresar' }}</span>
                  <span class="submit-icon" aria-hidden="true">
                    @if (cargando) { <span class="spinner spinner-dark"></span> } @else {
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                    }
                  </span>
                </button>
              </form>
            </div>

            <!-- Talón de acceso rápido -->
            <div class="ticket-stub">
              <span class="stub-title">Acceso rápido de demostración</span>
              <div class="stub-accounts">
                <button type="button" class="account" [class.selected]="loginForm.value.correo === 'admin@servillantas.pe'" (click)="cargarCuenta('admin@servillantas.pe', 'admin123')">
                  <span class="account-initial">P</span>
                  <span class="account-text"><strong>Propietario</strong><small>admin&#64;servillantas.pe</small></span>
                </button>
                <button type="button" class="account" [class.selected]="loginForm.value.correo === 'operador@servillantas.pe'" (click)="cargarCuenta('operador@servillantas.pe', 'operador123')">
                  <span class="account-initial">O</span>
                  <span class="account-text"><strong>Personal</strong><small>operador&#64;servillantas.pe</small></span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer class="bottom">
        <span>© {{ anio }} Servillantas RV</span>
        <span class="clock" aria-hidden="true"><i></i>Taller abierto · {{ hora }}</span>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .login-page {
      --ink: #111a20;
      --perf: 124px;
      position: relative;
      min-height: 100dvh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      overflow: hidden;
      color: #dfe6ea;
      background:
        radial-gradient(70% 55% at 85% 100%, rgba(166, 189, 62, 0.16), transparent 70%),
        radial-gradient(50% 40% at 10% 0%, rgba(120, 150, 170, 0.12), transparent 70%),
        var(--ink);
    }

    /* ---------- Banda de rodadura ---------- */
    .tread {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: grid;
      place-items: center;
    }

    .tread-band {
      width: 170vmax;
      height: clamp(220px, 34vh, 340px);
      transform: rotate(-14deg);
      border-block: 2px solid rgba(166, 189, 62, 0.35);
      background-color: #18232b;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='300' viewBox='0 0 72 300'%3E%3Cg fill='%23243440'%3E%3Cpath d='M4 18h26l30 116H34z'/%3E%3Cpath d='M34 166h26L30 282H4z'/%3E%3Crect x='10' y='2' width='40' height='8' rx='2'/%3E%3Crect x='10' y='290' width='40' height='8' rx='2'/%3E%3C/g%3E%3Cpath d='M0 150h72' stroke='%23121b21' stroke-width='6'/%3E%3C/svg%3E");
      background-size: auto 100%;
      background-repeat: repeat-x;
      box-shadow: inset 0 30px 40px -20px rgba(0, 0, 0, 0.55), inset 0 -30px 40px -20px rgba(0, 0, 0, 0.55);
      opacity: 0.9;
      animation: roll 14s linear infinite;
    }

    @keyframes roll {
      to { background-position-x: -720px; }
    }

    /* ---------- Marco ---------- */
    .top, .bottom {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 24px clamp(20px, 4vw, 48px);
    }

    .top { justify-content: flex-start; }

    .mark {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #f3f5f1;
      box-shadow: 0 0 0 4px rgba(166, 189, 62, 0.25);

      img { width: 34px; height: 34px; object-fit: contain; }
    }

    .brand {
      display: flex;
      flex-direction: column;
      line-height: 1.2;

      strong { color: #fff; font-size: 16px; font-weight: 750; letter-spacing: -0.01em; }
      small { color: #8c9aa4; font-size: 12px; }
    }

    .bottom {
      color: #7d8b95;
      font-size: 12px;
    }

    .clock {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;

      i { width: 7px; height: 7px; border-radius: 50%; background: var(--brand-lime); box-shadow: 0 0 0 3px rgba(166, 189, 62, 0.22); }
    }

    .center {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      padding: 8px 20px 24px;
    }

    /* ---------- Orden de ingreso ---------- */
    .ticket-shadow {
      width: 100%;
      max-width: 430px;
      filter: drop-shadow(0 24px 40px rgba(0, 0, 0, 0.45)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
      animation: arrive 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    .ticket {
      position: relative;
      border-radius: 18px;
      background: #fff;
      color: var(--text-primary);
      /* Muescas del troquel a ambos lados */
      -webkit-mask:
        radial-gradient(circle 12px at 0 calc(100% - var(--perf)), #0000 97%, #000),
        radial-gradient(circle 12px at 100% calc(100% - var(--perf)), #0000 97%, #000);
      -webkit-mask-composite: source-in;
      mask:
        radial-gradient(circle 12px at 0 calc(100% - var(--perf)), #0000 97%, #000),
        radial-gradient(circle 12px at 100% calc(100% - var(--perf)), #0000 97%, #000);
      mask-composite: intersect;
    }

    .ticket-main { padding: 30px 30px 26px; }

    .ticket-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;

      h1 { font-size: 25px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.15; }
      p { margin-top: 6px; color: var(--text-secondary); font-size: 13.5px; }
    }

    .stamp {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 62px;
      height: 62px;
      border: 2px solid var(--brand-lime-strong);
      border-radius: 50%;
      color: var(--brand-lime-strong);
      font-family: var(--font-mono);
      line-height: 1;
      text-transform: uppercase;
      transform: rotate(-12deg);
      animation: stamp 420ms cubic-bezier(0.2, 0, 0, 1) 360ms both;

      span:first-child { font-size: 20px; font-weight: 600; margin-top: 8px; }
      span:last-child { font-size: 10px; font-weight: 600; letter-spacing: 0.14em; margin-bottom: 10px; }
    }

    .alert {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 18px;
      padding: 11px 13px;
      border: 1px solid var(--state-danger-border);
      border-radius: 10px;
      background: var(--state-danger-bg);
      color: var(--state-danger);
      font-size: 13px;
      font-weight: 500;

      svg { flex: 0 0 17px; width: 17px; height: 17px; margin-top: 1px; }
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-bottom: 16px;

      label { color: var(--text-primary); font-size: 13px; font-weight: 650; }

      input {
        width: 100%;
        height: 50px;
        padding: 0 16px;
        border: 1.5px solid transparent;
        border-radius: 12px;
        background: #f1f4f2;
        color: var(--text-primary);
        font-size: 15px;
        transition: background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);

        &::placeholder { color: #8a959e; }
        &:hover { background: #ebefed; }
        &:focus { outline: none; background: #fff; border-color: var(--accent-primary); box-shadow: 0 0 0 4px var(--focus-ring); }
      }

      &.has-error input { border-color: var(--state-danger); background: #fff; }
    }

    .pass {
      position: relative;

      input { padding-right: 52px; }
    }

    .eye {
      position: absolute;
      top: 50%;
      right: 7px;
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: #7d8a93;
      cursor: pointer;
      transform: translateY(-50%);

      svg { width: 18px; height: 18px; }
      &:hover { background: rgba(38, 53, 63, 0.06); color: var(--text-primary); }
    }

    .field-error { color: var(--state-danger); font-size: 12px; font-weight: 500; }

    .submit {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: 54px;
      margin-top: 6px;
      padding: 0 7px 0 22px;
      border: 0;
      border-radius: 14px;
      background: var(--accent-primary);
      color: #fff;
      font-size: 15.5px;
      font-weight: 700;
      cursor: pointer;
      transition: background-color var(--transition-fast);

      &:hover:not(:disabled) { background: var(--accent-hover); }
      &:hover:not(:disabled) .submit-icon { transform: translateX(2px); }
      &:disabled { opacity: 0.55; cursor: not-allowed; }
    }

    .submit-icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--brand-lime);
      color: var(--brand-ink);
      transition: transform var(--transition-fast);

      svg { width: 18px; height: 18px; }
    }

    .ticket-stub {
      height: var(--perf);
      padding: 18px 30px 0;
      border-top: 2px dashed #d5dcd8;
      background: #f7f9f6;
    }

    .stub-title {
      display: block;
      margin-bottom: 10px;
      color: #6e7b84;
      font-size: 12px;
      font-weight: 600;
    }

    .stub-accounts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .account {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 9px 10px;
      border: 1px solid #dfe5e2;
      border-radius: 11px;
      background: #fff;
      text-align: left;
      cursor: pointer;
      transition: border-color var(--transition-fast), background-color var(--transition-fast);

      &:hover { border-color: #bcc6c1; }

      &.selected {
        border-color: var(--brand-lime-strong);
        background: var(--brand-lime-soft);

        .account-initial { background: var(--brand-lime); color: var(--brand-ink); }
      }
    }

    .account-initial {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--brand-ink);
      color: #fff;
      font-size: 12.5px;
      font-weight: 800;
      transition: background-color var(--transition-fast), color var(--transition-fast);
    }

    .account-text {
      display: flex;
      flex-direction: column;
      min-width: 0;

      strong { color: var(--text-primary); font-size: 13px; font-weight: 700; }
      small { overflow: hidden; color: #6e7b84; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    }

    @keyframes arrive {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: none; }
    }

    @keyframes stamp {
      from { opacity: 0; transform: rotate(-24deg) scale(1.35); }
      to { opacity: 1; transform: rotate(-12deg) scale(1); }
    }

    @media (max-width: 520px) {
      .login-page { --perf: 178px; }
      .top { padding: 18px 18px 6px; }
      .center { place-items: start center; padding: 10px 14px 18px; }
      .ticket-main { padding: 24px 20px 20px; }
      .ticket-head h1 { font-size: 22px; }
      .stamp { width: 54px; height: 54px; }
      .ticket-stub { padding: 16px 20px 0; }
      .stub-accounts { grid-template-columns: 1fr; gap: 8px; }
      .bottom { padding: 14px 18px 18px; font-size: 11.5px; }
      .tread-band { height: 200px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .tread-band, .ticket-shadow, .stamp { animation: none; }
    }
  `],
})
export class LoginComponent implements OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  loginForm: FormGroup = this.fb.group({
    correo: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]],
  });

  cargando = false;
  errorMensaje = '';
  verPassword = false;

  private readonly hoy = new Date();
  readonly anio = this.hoy.getFullYear();
  readonly dia = String(this.hoy.getDate()).padStart(2, '0');
  readonly mes = this.hoy.toLocaleDateString('es-PE', { month: 'short' }).replace('.', '');
  hora = this.horaActual();
  private readonly reloj = window.setInterval(() => (this.hora = this.horaActual()), 15000);

  ngOnDestroy(): void {
    window.clearInterval(this.reloj);
  }

  esCampoInvalido(campo: string): boolean {
    const control = this.loginForm.get(campo);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  cargarCuenta(correo: string, pass: string): void {
    this.loginForm.patchValue({ correo, password: pass });
    this.errorMensaje = '';
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.cargando = true;
    this.errorMensaje = '';

    this.authService.login(this.loginForm.value).subscribe({
      next: () => {
        this.cargando = false;
        const destino = this.authService.rol()?.nombre === 'propietario' ? '/dashboard' : '/inventario';
        this.router.navigate([destino]);
      },
      error: (err) => {
        this.cargando = false;
        this.errorMensaje =
          err?.error?.message ||
          err?.error?.mensaje || 'Credenciales incorrectas. Verifique su correo o contraseña.';
      },
    });
  }

  private horaActual(): string {
    return new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }
}
