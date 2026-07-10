import { Database, LockKeyhole, LogIn, LogOut, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppMark, Button, Field, Notice, Surface } from "../../components/ui";
import type { AuthInput } from "../../shared/presentation";
import type { AuthUser } from "../../shared/types";

export interface AuthViewProps {
  hasAccount: boolean;
  busy: boolean;
  error: string;
  onSubmit: (input: AuthInput) => void | Promise<void>;
}

export function AuthView(props: AuthViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const isLogin = props.hasAccount;
  const title = isLogin ? "登录 Outfit" : "创建本地账号";
  const submitLabel = isLogin ? "进入衣橱" : "创建并进入";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.onSubmit({ username, password });
  }

  return (
    <main className="auth-shell auth-feature">
      <div className="auth-layout">
        <section className="auth-story" aria-labelledby="auth-value-title">
          <AppMark />
          <div className="auth-story__copy">
            <h1 id="auth-value-title">你的衣橱，只留在你的设备上</h1>
            <p>账号、衣物和穿着记录保存在本机。Outfit 用一层本地门禁保护这些私人数据。</p>
          </div>
          <div className="auth-value-list" aria-label="本地隐私说明">
            <div>
              <LockKeyhole aria-hidden="true" size={20} />
              <span><strong>本地门禁</strong><small>只有这台设备上的账号可以进入。</small></span>
            </div>
            <div>
              <Database aria-hidden="true" size={20} />
              <span><strong>本地存储</strong><small>衣物、画像和记录不会发送到第三方服务。</small></span>
            </div>
          </div>
        </section>

        <Surface as="section" className="auth-card auth-card--form">
          <div className="auth-card__heading">
            <span className="auth-mark" aria-hidden="true">
              {isLogin ? <LogIn size={24} /> : <LockKeyhole size={24} />}
            </span>
            <div>
              <h2>{title}</h2>
              <p>{isLogin ? "输入本地账号，继续整理今天的穿搭。" : "首次使用时创建本机门禁账号。"}</p>
            </div>
          </div>

          {props.error ? (
            <Notice tone="danger" role="alert" title="无法继续">
              {props.error}
            </Notice>
          ) : null}

          <form className="auth-form" aria-busy={props.busy} onSubmit={submit}>
            <Field
              id="auth-username"
              label="用户名"
              value={username}
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]{3,32}"
              required
              hint="使用 3 至 32 位字母、数字或下划线。"
              onChange={(event) => setUsername(event.target.value)}
            />
            <Field
              id="auth-password"
              label="密码"
              value={password}
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={8}
              maxLength={128}
              required
              hint={isLogin ? undefined : "至少 8 位，仅用于保护本机衣橱。"}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button className="auth-submit" disabled={props.busy} type="submit" variant="primary">
              {isLogin ? <LogIn aria-hidden="true" size={18} /> : <LockKeyhole aria-hidden="true" size={18} />}
              {props.busy ? "处理中" : submitLabel}
            </Button>
          </form>
        </Surface>
      </div>
    </main>
  );
}

export function SessionSummary({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  return (
    <div className="session-card">
      <div className="session-user">
        <UserRound aria-hidden="true" size={18} />
        <div>
          <span>当前账号</span>
          <strong>{user.username}</strong>
        </div>
      </div>
      <Button className="session-logout" aria-label="退出" onClick={onLogout} variant="ghost">
        <LogOut aria-hidden="true" size={18} />
        <span>退出</span>
      </Button>
    </div>
  );
}
