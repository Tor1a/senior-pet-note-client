import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import PetAvatar from '../components/PetAvatar';
import { ApiError, toUserMessage } from '../lib/api';
import { petApi } from '../lib/client';
import { DISCLAIMER } from '../lib/constants';
import type { Pet, PetInput, Species } from '../lib/petApi';
import { PHOTO_HINT, validatePhoto } from '../lib/photo';
import { usePet } from '../pet';

// 반려동물 등록(/pets/new, 온보딩 1/2) · 프로필 수정(/pet)
// 이름(필수), 개/고양이(필수), 태어난 해·질환·사진(선택)
const NAME_MAX = 30;
const CONDITIONS_MAX = 200;
const MIN_YEAR = 1980;

export default function PetFormPage({ mode }: { mode: 'new' | 'edit' }) {
  const { pet, status, setPet, reload } = usePet();
  // 등록 화면을 열 때 이미 반려동물이 있으면 오늘 화면으로 (등록 직후 이동과 겹치지 않게 처음 값만 본다)
  const [alreadyHasPet] = useState(mode === 'new' && status === 'ready');
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = mode === 'new';
  const editing = isNew ? null : pet;

  const [name, setName] = useState(editing?.name ?? '');
  const [species, setSpecies] = useState<Species | null>(editing?.species ?? null);
  const [birthYear, setBirthYear] = useState<string>(editing?.birthYear ? String(editing.birthYear) : '');
  const [conditions, setConditions] = useState(editing?.conditions ?? '');
  const [fieldError, setFieldError] = useState<{ name?: string; species?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  // 사진: 고른 파일과 업로드 전 미리보기
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y >= MIN_YEAR; y--) years.push(y);

  function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // 같은 파일을 다시 골라도 change 가 일어나게
    if (!file) return;
    const problem = validatePhoto(file);
    setPhotoError(problem);
    setPhotoFile(problem ? null : file);
  }

  function handleError(err: unknown, context: 'pet' | 'photo') {
    if (err instanceof ApiError && err.status === 404 && !isNew) {
      void reload(); // pet 이 없어졌으면 등록 화면으로
      return;
    }
    if (err instanceof ApiError && err.code === 'PET_LIMIT_REACHED') {
      void reload(); // 이미 등록돼 있으면 오늘 화면으로
      return;
    }
    const message = toUserMessage(err, context);
    if (context === 'photo') setPhotoError(message);
    else setFormError(message);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errors: { name?: string; species?: string } = {};
    if (!name.trim()) errors.name = '이름을 적어 주세요.';
    else if (name.trim().length > NAME_MAX) errors.name = `이름은 ${NAME_MAX}자까지 적을 수 있어요.`;
    if (!species) errors.species = '개인지 고양이인지 골라 주세요.';
    setFieldError(errors);
    setFormError(null);
    setNotice(null);
    if (Object.keys(errors).length > 0 || !species) return;

    const input: PetInput = {
      name: name.trim(),
      species,
      birthYear: birthYear ? Number(birthYear) : null,
      conditions: conditions.trim() ? conditions.trim() : null,
    };
    setSubmitting(true);
    try {
      if (isNew) {
        let saved: Pet = await petApi.createPet(input);
        if (photoFile) {
          try {
            saved = await petApi.uploadPhoto(saved.id, photoFile);
          } catch (err) {
            // 프로필은 저장됐으니 수정 화면에서 사진만 다시 올리게 한다
            setPet(saved);
            navigate('/pet', {
              replace: true,
              state: { notice: `프로필은 저장했어요. ${toUserMessage(err, 'photo')}` },
            });
            return;
          }
        }
        setPet(saved);
        navigate('/medications?onboarding=1', { replace: true });
      } else if (editing) {
        const saved = await petApi.updatePet(editing.id, input);
        setPet(saved);
        setNotice('프로필을 저장했어요.');
        setSubmitting(false);
      }
    } catch (err) {
      handleError(err, 'pet');
      setSubmitting(false);
    }
  }

  async function uploadNow() {
    if (!editing || !photoFile || photoBusy) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const saved = await petApi.uploadPhoto(editing.id, photoFile);
      setPet(saved);
      setPhotoFile(null);
      setNotice('사진을 바꿨어요.');
    } catch (err) {
      handleError(err, 'photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deletePhoto() {
    if (!editing || photoBusy) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await petApi.deletePhoto(editing.id);
      setPet({ ...editing, hasPhoto: false, updatedAt: new Date().toISOString() });
      setNotice('사진을 지웠어요.');
    } catch (err) {
      handleError(err, 'photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  if (alreadyHasPet) return <Navigate to="/today" replace />;

  return (
    <div>
      <header className="topbar">
        {isNew ? <span className="step">1 / 2</span> : <Link to="/today" className="btn-link">← 오늘로</Link>}
        {!isNew && (
          <button type="button" className="btn-link" onClick={logout}>
            로그아웃
          </button>
        )}
      </header>
      <main className="page">
        <h1>{isNew ? '반려동물을 소개해 주세요' : '프로필 수정'}</h1>
        {isNew && <p className="lead">이름과 종류만 적어도 시작할 수 있어요.</p>}

        <form onSubmit={onSubmit} className="card" noValidate>
          <label htmlFor="pet-name">이름</label>
          <input
            id="pet-name"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="off"
            placeholder="예: 보리"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={fieldError.name ? true : undefined}
            aria-describedby={fieldError.name ? 'pet-name-error' : undefined}
          />
          {fieldError.name && (
            <p id="pet-name-error" className="field-hint">
              {fieldError.name}
            </p>
          )}

          <fieldset className="plain">
            <legend>종류</legend>
            <div className="choice-row" role="radiogroup" aria-label="종류">
              {(
                [
                  ['dog', '🐶 개'],
                  ['cat', '🐱 고양이'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={species === value}
                  className={`choice ${species === value ? 'is-confirmed' : ''}`}
                  onClick={() => setSpecies(value)}
                >
                  <span>{species === value && <span aria-hidden="true">✓ </span>}
                  {label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {fieldError.species && <p className="field-hint">{fieldError.species}</p>}

          <label htmlFor="pet-birth">태어난 해 (선택)</label>
          <select id="pet-birth" value={birthYear} onChange={(e) => setBirthYear(e.target.value)}>
            <option value="">모르거나 적지 않음</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>

          <label htmlFor="pet-conditions">앓고 있는 질환 (선택)</label>
          <input
            id="pet-conditions"
            value={conditions}
            maxLength={CONDITIONS_MAX}
            placeholder="예: 신부전, 심장병"
            onChange={(e) => setConditions(e.target.value)}
          />

          {isNew && (
            <PhotoPicker
              previewUrl={previewUrl}
              current={null}
              error={photoError}
              onPick={() => fileInput.current?.click()}
              onClear={photoFile ? () => setPhotoFile(null) : undefined}
            />
          )}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '잠시만요…' : isNew ? '다음' : '프로필 저장'}
          </button>
          {formError && (
            <p role="alert" className="error">
              {formError}
            </p>
          )}
          {notice && (
            <p role="status" className="ok">
              {notice}
            </p>
          )}
        </form>

        {!isNew && editing && (
          <section className="card" aria-labelledby="photo-title">
            <h2 id="photo-title">사진</h2>
            <PhotoPicker
              previewUrl={previewUrl}
              current={editing}
              error={photoError}
              onPick={() => fileInput.current?.click()}
              onClear={photoFile ? () => setPhotoFile(null) : undefined}
            />
            {photoFile && (
              <button type="button" className="btn-primary" onClick={uploadNow} disabled={photoBusy}>
                {photoBusy ? '올리는 중…' : '이 사진으로 바꾸기'}
              </button>
            )}
            {!photoFile && editing.hasPhoto && (
              <button type="button" className="btn-secondary" onClick={deletePhoto} disabled={photoBusy}>
                사진 지우기
              </button>
            )}
          </section>
        )}

        {!isNew && (
          <p>
            <Link to="/medications" className="btn-link">
              먹이는 약 관리
            </Link>
          </p>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onPickPhoto}
          data-testid="photo-input"
        />
        <p className="disclaimer">{DISCLAIMER}</p>
      </main>
    </div>
  );
}

function PhotoPicker({
  previewUrl,
  current,
  error,
  onPick,
  onClear,
}: {
  previewUrl: string | null;
  current: Pet | null;
  error: string | null;
  onPick: () => void;
  onClear?: () => void;
}) {
  return (
    <div className="photo-picker">
      {current === null && <span className="label">사진 (선택)</span>}
      <div className="photo-row">
        {previewUrl ? (
          <img className="avatar" src={previewUrl} alt="고른 사진 미리보기" style={{ width: 96, height: 96 }} />
        ) : (
          <PetAvatar pet={current} size={96} />
        )}
        <div className="photo-actions">
          <button type="button" className="btn-secondary" onClick={onPick}>
            {previewUrl || current?.hasPhoto ? '다른 사진 고르기' : '사진 고르기'}
          </button>
          {onClear && (
            <button type="button" className="btn-link" onClick={onClear}>
              고르기 취소
            </button>
          )}
        </div>
      </div>
      <p className="muted small">{PHOTO_HINT}</p>
      {previewUrl && <p className="muted small">미리보기예요. {current ? '아래 버튼을 눌러야 바뀌어요.' : '[다음]을 누르면 함께 저장돼요.'}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
