import { useEffect, useMemo, useRef, useState } from "react";
import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CameraOutlined } from "@ant-design/icons";
import { Alert, Avatar, Button, Card, Input, Switch, TimePicker, Upload } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { FormControl, FormField } from "../../components/FormField";
import { api } from "../../lib/api";
import { hoursFromStore, WEEKDAY_ROWS } from "../../lib/hours";
import { fileToBase64, prepareStorePhoto } from "../../lib/image";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import {
  storeBrandingSchema,
  type StoreBrandingValues,
} from "../../lib/validation";
import type { BusinessHoursDay, Store } from "../../types";

dayjs.extend(customParseFormat);

function parseClock(value: string) {
  const parsed = dayjs(value, "HH:mm", true);
  return parsed.isValid() ? parsed : null;
}

function toClock(value: Dayjs | null | undefined) {
  return value?.isValid() ? value.format("HH:mm") : "";
}

/** TimePicker que mantém rascunho no painel e grava no Formik ao escolher ou fechar. */
function HoursTimePicker({
  value,
  onCommit,
  onBlur,
  disabled,
  placeholder,
}: {
  value: unknown;
  onCommit: (hhmm: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const committed = typeof value === "string" ? parseClock(value) : null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Dayjs | null>(null);
  const draftRef = useRef<Dayjs | null>(null);

  const display = open ? (draft ?? committed) : committed;

  const apply = (next: Dayjs | null | undefined) => {
    if (!next?.isValid()) return;
    draftRef.current = next;
    setDraft(next);
    onCommit(toClock(next));
  };

  return (
    <TimePicker
      format="HH:mm"
      minuteStep={5}
      // Sem botão OK: confirma ao escolher e ao fechar o painel.
      // Evita onBlur do Formik no meio da seleção (isso descartava o valor).
      needConfirm={false}
      allowClear={false}
      showNow={false}
      changeOnScroll
      inputReadOnly
      disabled={disabled}
      placeholder={placeholder}
      value={display}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          draftRef.current = committed;
          setDraft(committed);
          return;
        }
        const finalValue = draftRef.current ?? draft ?? committed;
        if (finalValue?.isValid()) onCommit(toClock(finalValue));
        draftRef.current = null;
        setDraft(null);
        onBlur?.();
      }}
      onChange={(next) => apply(next)}
      onCalendarChange={(next) => {
        const picked = Array.isArray(next) ? next[0] : next;
        apply(picked);
      }}
      className="w-[108px]"
    />
  );
}

export function BrandingCard({
  store,
  whatsappReady,
}: {
  store?: Store;
  whatsappReady?: boolean;
}) {
  const queryClient = useQueryClient();
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = useMemo(() => {
    if (photo) return URL.createObjectURL(photo);
    return store?.profilePhotoUrl || undefined;
  }, [photo, store?.profilePhotoUrl]);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(preview ?? "");
  }, [photo, preview]);

  const saveMutation = useMutation({
    mutationFn: async (values: StoreBrandingValues) => {
      let photoPayload: { mime: string; data: string } | undefined;
      if (photo) {
        const prepared = await prepareStorePhoto(photo);
        photoPayload = {
          mime: "image/jpeg",
          data: await fileToBase64(prepared),
        };
      }
      return api.updateStore({
        name: values.name.trim(),
        photo: photoPayload,
        businessHours: values.hours.map(
          (day): BusinessHoursDay => ({
            day: Number(day.day) as BusinessHoursDay["day"],
            closed: Boolean(day.closed),
            open: day.open || "18:00",
            close: day.close || "23:00",
          }),
        ),
      });
    },
    onSuccess: async (result) => {
      setPhoto(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
      if (result.whatsappError) {
        toast.error(`Salvo no painel. WhatsApp: ${result.whatsappError}`);
        return;
      }
      toast.success(
        whatsappReady
          ? "Perfil atualizado. A foto entra no WhatsApp em alguns minutos."
          : "Perfil salvo. Conecte o WhatsApp para a foto ir para a conversa.",
      );
    },
  });

  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft"
      title="Perfil do estabelecimento"
    >
      <p className="mb-5 max-w-2xl text-sm leading-normal text-food-muted">
        Nome e foto que o cliente vê. A foto atualiza o avatar da conversa no
        WhatsApp. O nome entra nas mensagens do bot. Fora do horário abaixo, o
        bot avisa que a loja está fechada.
      </p>

      <Formik
        enableReinitialize
        initialValues={{
          name: store?.name ?? "",
          hours: hoursFromStore(store?.businessHours),
        }}
        validationSchema={storeBrandingSchema}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            await saveMutation.mutateAsync(values);
          } catch (error) {
            helpers.setStatus(
              error instanceof Error
                ? error.message
                : "Não foi possível salvar o perfil.",
            );
          }
        }}
      >
        {({ isSubmitting, status, values, setFieldValue }) => (
          <FormikForm>
            {status ? (
              <Alert
                type="error"
                showIcon
                className="mb-3"
                message={status}
              />
            ) : null}

            <div className="max-w-md">
              <div className="mb-4 flex items-center gap-3">
                <Avatar
                  src={preview}
                  size={72}
                  className="shrink-0 border border-food-border bg-food-chip text-2xl"
                >
                  {(values.name || "E").trim().charAt(0).toUpperCase()}
                </Avatar>
                <div>
                  <Upload
                    accept="image/png,image/jpeg,image/webp"
                    showUploadList={false}
                    beforeUpload={(file) => {
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error("A foto precisa ter no máximo 2 MB.");
                        return Upload.LIST_IGNORE;
                      }
                      setPhoto(file);
                      return false;
                    }}
                  >
                    <Button icon={<CameraOutlined />}>Trocar foto</Button>
                  </Upload>
                  <p className="mb-0 mt-1.5 text-xs text-food-muted">
                    JPG, PNG ou WEBP · quadrada · até 2 MB
                  </p>
                </div>
              </div>
              <FormField name="name" label="Nome do estabelecimento">
                <Input placeholder="Ex.: Pizzaria do Bairro…" maxLength={80} />
              </FormField>
            </div>

            <div className="mt-2 max-w-2xl">
              <h3 className="m-0 mb-1 text-base font-bold tracking-tight text-food-text">
                Horário de funcionamento
              </h3>
              <p className="mb-3 text-[13px] leading-snug text-food-muted">
                Dias e horários no fuso de Brasília. Se fechar depois da
                meia-noite, use o horário do dia seguinte — por exemplo 18:00
                às 02:00.
              </p>
              <div className="overflow-hidden rounded-2xl border border-food-border">
                {values.hours.map((day, index) => {
                  const label =
                    WEEKDAY_ROWS.find((row) => row.day === day.day)?.label ??
                    "Dia";
                  const overnight =
                    !day.closed &&
                    Boolean(day.open) &&
                    Boolean(day.close) &&
                    day.close < day.open;
                  return (
                    <div
                      key={day.day}
                      className="grid items-center gap-3 border-b border-food-border px-3.5 py-3 last:border-b-0 max-sm:grid-cols-1 sm:grid-cols-[7.5rem_5.5rem_minmax(0,1fr)]"
                    >
                      <span className="text-sm font-semibold text-food-text">
                        {label}
                      </span>
                      <Switch
                        checked={!day.closed}
                        checkedChildren="Aberto"
                        unCheckedChildren="Fechado"
                        onChange={(open) =>
                          setFieldValue(`hours.${index}.closed`, !open)
                        }
                      />
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <FormControl name={`hours.${index}.open`} compact>
                          {({ value, setValue, setTouched }) => (
                            <HoursTimePicker
                              value={value}
                              disabled={day.closed}
                              placeholder="Abre"
                              onCommit={(hhmm) => setValue(hhmm)}
                              onBlur={setTouched}
                            />
                          )}
                        </FormControl>
                        <span className="text-xs text-food-muted">às</span>
                        <FormControl name={`hours.${index}.close`} compact>
                          {({ value, setValue, setTouched }) => (
                            <HoursTimePicker
                              value={value}
                              disabled={day.closed}
                              placeholder="Fecha"
                              onCommit={(hhmm) => setValue(hhmm)}
                              onBlur={setTouched}
                            />
                          )}
                        </FormControl>
                        {overnight ? (
                          <span className="text-[11px] text-food-muted">
                            fecha no dia seguinte
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Button
              type="primary"
              htmlType="submit"
              className="mt-4"
              loading={isSubmitting || saveMutation.isPending}
              disabled={!store}
            >
              Salvar perfil
            </Button>
          </FormikForm>
        )}
      </Formik>
    </Card>
  );
}
